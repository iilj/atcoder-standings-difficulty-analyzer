import moment = require('moment');
import css from './parent.scss';
import { ElapsedSeconds, Rating, Score, StandingsEntry, TaskInfoEntry, VueStandings } from '../interfaces/Standings';
import { getCenterOfInnerRating, rangeLen } from '../utils';
import {
    ContestAcRatioModel,
    fetchContestAcRatioModel,
    fetchInnerRatingsFromPredictor,
    InnerRatingsFromPredictor,
} from '../utils/data';
import { DifficultyCalculator } from '../utils/DifficultyCalculator';
import { RatingConverter } from '../utils/RatingConverter';
import { Charts } from './Charts';
import { DifficyltyTable } from './DifficultyTable';
import { Tabs } from './Tabs';

const NS2SEC = 1000000000 as const;

const CONTENT_DIV_ID = 'acssa-contents' as const;

export class Parent {
    readonly centerOfInnerRating: number;
    readonly acRatioModel: ContestAcRatioModel;
    working: boolean;
    oldStandingsData: StandingsEntry[] | null;

    elapsedMinutes!: number;
    isDuringContest!: boolean;
    isEstimationEnabled!: boolean;

    tasks!: TaskInfoEntry[];

    innerRatingsFromPredictor!: InnerRatingsFromPredictor;

    /** 問題ごとの最終 AC 時刻リスト． */
    scoreLastAcceptedTimeMap!: Map<Score, ElapsedSeconds[]>;
    /** 各問題の正答者数． */
    taskAcceptedCounts!: number[];
    /** 各問題の正答時間リスト．秒単位で格納する． */
    taskAcceptedElapsedTimes!: ElapsedSeconds[][];
    /** 内部レートのリスト． */
    innerRatings!: Rating[];
    /** 現在のユーザの各問題の AC 時刻． */
    yourTaskAcceptedElapsedTimes!: ElapsedSeconds[];
    /** 現在のユーザのスコア */
    yourScore!: Score;
    /** 現在のユーザの最終 AC 時刻 */
    yourLastAcceptedTime!: ElapsedSeconds;
    /** 参加者数 */
    participants!: number;
    /** 問題ごとの，コンテスト終了時点での推定正答者数 */
    acCountPredicted!: number[];
    /** 参加者の内部レートリストを基にして difficulty を推定する */
    dc!: DifficultyCalculator;

    constructor(acRatioModel: ContestAcRatioModel) {
        const loaderStyles = GM_getResourceText('loaders.min.css');
        GM_addStyle(loaderStyles + '\n' + css);

        this.centerOfInnerRating = getCenterOfInnerRating(contestScreenName);
        this.acRatioModel = acRatioModel;
        this.working = false;
        this.oldStandingsData = null;
    }

    public static init = async (): Promise<Parent> => {
        const curr = moment();
        if (startTime <= curr && curr < endTime) {
            const contestDurationMinutes = endTime.diff(startTime) / 1000 / 60;
            return new Parent(await fetchContestAcRatioModel(contestScreenName, contestDurationMinutes));
        } else {
            return new Parent(undefined);
        }
    };

    async onStandingsChanged(standings: VueStandings): Promise<void> {
        if (!standings) return;
        if (this.working) return;

        this.tasks = standings.TaskInfo;
        const standingsData = standings.StandingsData; // vueStandings.filteredStandings;

        if (this.oldStandingsData === standingsData) return;
        if (this.tasks.length === 0) return;
        this.oldStandingsData = standingsData;
        this.working = true;

        this.removeOldContents();

        const currentTime: moment.Moment = moment();
        this.elapsedMinutes = Math.floor(currentTime.diff(startTime) / 60 / 1000);
        this.isDuringContest = startTime <= currentTime && currentTime < endTime;
        this.isEstimationEnabled = this.isDuringContest && this.elapsedMinutes >= 1 && this.tasks.length < 10;

        this.innerRatingsFromPredictor = await fetchInnerRatingsFromPredictor(contestScreenName);

        this.scanStandingsData(standingsData);
        this.predictAcCountSeries();

        const standingsElement = document.getElementById('vue-standings') as HTMLElement;
        const acssaContentDiv: HTMLDivElement = document.createElement('div');
        acssaContentDiv.id = CONTENT_DIV_ID;
        standingsElement.insertAdjacentElement('afterbegin', acssaContentDiv);

        // difficulty
        new DifficyltyTable(
            acssaContentDiv,
            this.tasks,
            this.isEstimationEnabled,
            this.dc,
            this.taskAcceptedCounts,
            this.yourTaskAcceptedElapsedTimes,
            this.acCountPredicted
        );
        // tabs
        const tabs = new Tabs(acssaContentDiv, this.yourScore, this.participants);

        const charts = new Charts(
            acssaContentDiv,
            this.tasks,
            this.scoreLastAcceptedTimeMap,
            this.taskAcceptedCounts,
            this.taskAcceptedElapsedTimes,
            this.yourTaskAcceptedElapsedTimes,
            this.yourScore,
            this.yourLastAcceptedTime,
            this.participants,
            this.dc,
            tabs
        );

        // 順位表のその他の描画を優先するために，プロットは後回しにする
        window.setTimeout((): void => {
            void charts.plotAsync().then(() => {
                charts.hideLoader();
                tabs.showTabsControl();
                this.working = false;
            });
        }, 100);
    }

    removeOldContents(): void {
        const oldContents = document.getElementById(CONTENT_DIV_ID);
        if (oldContents) {
            // oldContents.parentNode.removeChild(oldContents);
            oldContents.remove();
        }
    }

    scanStandingsData(standingsData: StandingsEntry[]): void {
        // init
        this.scoreLastAcceptedTimeMap = new Map<Score, ElapsedSeconds[]>();
        this.taskAcceptedCounts = rangeLen(this.tasks.length).fill(0);
        this.taskAcceptedElapsedTimes = rangeLen(this.tasks.length).map(() => [] as number[]);
        this.innerRatings = [] as Rating[];
        this.yourTaskAcceptedElapsedTimes = rangeLen(this.tasks.length).fill(-1);
        this.yourScore = -1;
        this.yourLastAcceptedTime = -1;
        this.participants = 0;

        // scan
        for (let i = 0; i < standingsData.length; ++i) {
            const standingsEntry = standingsData[i];

            if (!standingsEntry.TaskResults) continue; // 参加登録していない
            if (standingsEntry.UserIsDeleted) continue; // アカウント削除
            let correctedRating = this.isDuringContest ? standingsEntry.Rating : standingsEntry.OldRating;
            const isTeamOrBeginner = correctedRating === 0;
            if (isTeamOrBeginner) {
                // continue; // 初参加 or チーム
                correctedRating = this.centerOfInnerRating;
            }

            // これは飛ばしちゃダメ（提出しても 0 AC だと Penalty == 0 なので）
            // if (standingsEntry.TotalResult.Score == 0 && standingsEntry.TotalResult.Penalty == 0) continue;

            let score = 0;
            let penalty = 0;
            for (let j = 0; j < this.tasks.length; ++j) {
                const taskResultEntry = standingsEntry.TaskResults[this.tasks[j].TaskScreenName];
                if (!taskResultEntry) continue; // 未提出
                score += taskResultEntry.Score;
                penalty += taskResultEntry.Score === 0 ? taskResultEntry.Failure : taskResultEntry.Penalty;
            }
            if (score === 0 && penalty === 0) continue; // NoSub を飛ばす
            this.participants++;
            // console.log(i + 1, score, penalty);

            score /= 100;
            if (this.scoreLastAcceptedTimeMap.has(score)) {
                (this.scoreLastAcceptedTimeMap.get(score) as ElapsedSeconds[]).push(
                    standingsEntry.TotalResult.Elapsed / NS2SEC
                );
            } else {
                this.scoreLastAcceptedTimeMap.set(score, [standingsEntry.TotalResult.Elapsed / NS2SEC]);
            }

            const innerRating: Rating = isTeamOrBeginner
                ? correctedRating
                : standingsEntry.UserScreenName in this.innerRatingsFromPredictor
                ? this.innerRatingsFromPredictor[standingsEntry.UserScreenName]
                : RatingConverter.toInnerRating(
                      Math.max(RatingConverter.toRealRating(correctedRating), 1),
                      standingsEntry.Competitions
                  );
            if (innerRating) this.innerRatings.push(innerRating);
            else {
                console.log(i, innerRating, correctedRating, standingsEntry.Competitions);
                continue;
            }
            for (let j = 0; j < this.tasks.length; ++j) {
                const taskResultEntry = standingsEntry.TaskResults[this.tasks[j].TaskScreenName];
                const isAccepted = taskResultEntry?.Score > 0 && taskResultEntry?.Status == 1;
                if (isAccepted) {
                    ++this.taskAcceptedCounts[j];
                    this.taskAcceptedElapsedTimes[j].push(taskResultEntry.Elapsed / NS2SEC);
                }
            }
            if (standingsEntry.UserScreenName == userScreenName) {
                this.yourScore = score;
                this.yourLastAcceptedTime = standingsEntry.TotalResult.Elapsed / NS2SEC;
                for (let j = 0; j < this.tasks.length; ++j) {
                    const taskResultEntry = standingsEntry.TaskResults[this.tasks[j].TaskScreenName];
                    const isAccepted = taskResultEntry?.Score > 0 && taskResultEntry?.Status == 1;
                    if (isAccepted) {
                        this.yourTaskAcceptedElapsedTimes[j] = taskResultEntry.Elapsed / NS2SEC;
                    }
                }
            }
        } // end for
        this.innerRatings.sort((a: Rating, b: Rating) => a - b);
        this.dc = new DifficultyCalculator(this.innerRatings);
    } // end async scanStandingsData

    predictAcCountSeries(): void {
        if (!this.isEstimationEnabled) {
            this.acCountPredicted = [];
            return;
        }
        // 時間ごとの AC 数推移を計算する
        const taskAcceptedCountImos = rangeLen(this.tasks.length).map(() => rangeLen(this.elapsedMinutes).map(() => 0));
        this.taskAcceptedElapsedTimes.forEach((ar, index) => {
            ar.forEach((seconds) => {
                const minutes = Math.floor(seconds / 60);
                if (minutes >= this.elapsedMinutes) return;
                taskAcceptedCountImos[index][minutes] += 1;
            });
        });
        const taskAcceptedRatio: number[][] = rangeLen(this.tasks.length).map(() => [] as number[]);
        taskAcceptedCountImos.forEach((ar, index) => {
            let cum = 0;
            ar.forEach((imos) => {
                cum += imos;
                taskAcceptedRatio[index].push(cum / this.participants);
            });
        });
        // 差の自乗和が最小になるシーケンスを探す
        this.acCountPredicted = taskAcceptedRatio.map((ar) => {
            if (this.acRatioModel === undefined) return 0;
            if (ar[this.elapsedMinutes - 1] === 0) return 0;
            let minerror = 1.0 * this.elapsedMinutes;
            // let argmin = '';
            let last_ratio = 0;
            Object.keys(this.acRatioModel).forEach((key) => {
                if (this.acRatioModel === undefined) return;
                const ar2 = this.acRatioModel[key];
                let error = 0;
                for (let i = 0; i < this.elapsedMinutes; ++i) {
                    error += Math.pow(ar[i] - ar2[i], 2);
                }
                if (error < minerror) {
                    minerror = error;
                    // argmin = key;
                    if (ar2[this.elapsedMinutes - 1] > 0) {
                        last_ratio = ar2[ar2.length - 1] * (ar[this.elapsedMinutes - 1] / ar2[this.elapsedMinutes - 1]);
                    } else {
                        last_ratio = ar2[ar2.length - 1];
                    }
                }
            });
            // console.log(argmin, minerror, last_ratio);
            if (last_ratio > 1) last_ratio = 1;
            return this.participants * last_ratio;
        });
    } // end predictAcCountSeries();
}
