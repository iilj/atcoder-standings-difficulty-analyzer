import moment = require('moment');
import { Rating, StandingsEntry, TaskInfoEntry } from '../interfaces/Standings';
import { getColor } from '../utils';
import { InnerRatingsFromPredictor } from '../utils/data';
import { DifficultyCalculator } from '../utils/DifficultyCalculator';
import { RatingConverter } from '../utils/RatingConverter';
import { DEBUG, DEBUG_USERNAME } from './debug';
import { generateDifficultyCircle } from './DifficultyCircle';

const finf = bigf(400);
function bigf(n: number): number {
    let pow1 = 1;
    let pow2 = 1;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; ++i) {
        pow1 *= 0.81;
        pow2 *= 0.9;
        numerator += pow1;
        denominator += pow2;
    }
    return Math.sqrt(numerator) / denominator;
}
function f(n: number): number {
    return ((bigf(n) - finf) / (bigf(1) - finf)) * 1200.0;
}

/**
 * calculate unpositivized rating from last state
 * @param {Number} [last] last unpositivized rating
 * @param {Number} [perf] performance
 * @param {Number} [ratedMatches] count of participated rated contest
 * @returns {number} estimated unpositivized rating
 */
function calcRatingFromLast(last: number, perf: number, ratedMatches: number): number {
    if (ratedMatches === 0) return perf - 1200;
    last += f(ratedMatches);
    const weight = 9 - 9 * Math.pow(0.9, ratedMatches);
    const numerator = weight * Math.pow(2, last / 800.0) + Math.pow(2, perf / 800.0);
    const denominator = 1 + weight;
    return Math.log2(numerator / denominator) * 800.0 - f(ratedMatches + 1);
}

// class Random {
//     x: number
//     y: number
//     z: number
//     w: number
//     constructor(seed = 88675123) {
//         this.x = 123456789;
//         this.y = 362436069;
//         this.z = 521288629;
//         this.w = seed;
//     }

//     // XorShift
//     next(): number {
//         let t;

//         t = this.x ^ (this.x << 11);
//         this.x = this.y; this.y = this.z; this.z = this.w;
//         return this.w = (this.w ^ (this.w >>> 19)) ^ (t ^ (t >>> 8));
//     }

//     // min以上max以下の乱数を生成する
//     nextInt(min: number, max: number): number {
//         const r = Math.abs(this.next());
//         return min + (r % (max + 1 - min));
//     }
// };

export class PerformanceTable {
    readonly centerOfInnerRating: number;

    constructor(
        parent: HTMLDivElement,
        tasks: TaskInfoEntry[],
        isEstimationEnabled: boolean,
        yourStandingsEntry: StandingsEntry | undefined,
        taskAcceptedCounts: number[],
        acCountPredicted: number[],
        standingsData: StandingsEntry[],
        innerRatingsFromPredictor: InnerRatingsFromPredictor,
        dcForPerformance: DifficultyCalculator,
        centerOfInnerRating: number,
        useRating: boolean
    ) {
        this.centerOfInnerRating = centerOfInnerRating;
        if (yourStandingsEntry === undefined) return;

        // コンテスト終了時点での順位表を予測する
        const len = acCountPredicted.length;
        const rems: number[] = [];
        for (let i = 0; i < len; ++i) {
            rems.push(Math.ceil(acCountPredicted[i] - taskAcceptedCounts[i])); //
        }
        // console.log(rems);

        type ScoreRow = [Rating, number, number, number[], boolean];
        const scores: ScoreRow[] = []; // (現レート，スコア合計，時間，問題ごとのスコア，rated)
        const highestScores = tasks.map(() => 0);
        let rowPtr: ScoreRow | undefined = undefined;
        // const ratedInnerRatings: Rating[] = [];
        const ratedUserRanks: number[] = [];
        // console.log(standingsData);
        const threthold: moment.Moment = moment('2021-12-03T21:00:00+09:00');
        const isAfterABC230 = startTime >= threthold;
        // OldRating が全員 0 なら，強制的に Rating を使用する（コンテスト終了後，レート更新前）
        standingsData.forEach((standingsEntry: StandingsEntry) => {
            const userScores = [];
            let penalty = 0;
            for (let j = 0; j < tasks.length; ++j) {
                const taskResultEntry = standingsEntry.TaskResults[tasks[j].TaskScreenName];
                if (!taskResultEntry) {
                    // 未提出
                    userScores.push(0);
                } else {
                    userScores.push(taskResultEntry.Score / 100);
                    highestScores[j] = Math.max(highestScores[j], taskResultEntry.Score / 100);
                    penalty += taskResultEntry.Score === 0 ? taskResultEntry.Failure : taskResultEntry.Penalty;
                }
            }
            // const isRated = standingsEntry.IsRated && standingsEntry.TotalResult.Count > 0;
            const isRated = standingsEntry.IsRated && (isAfterABC230 || standingsEntry.TotalResult.Count > 0);
            if (!isRated) {
                if (standingsEntry.TotalResult.Score === 0 && penalty === 0 && standingsEntry.TotalResult.Count == 0) {
                    return; // NoSub を飛ばす
                }
            }

            let correctedRating = standingsEntry.Rating;
            const isTeamOrBeginner = correctedRating === 0;
            if (isTeamOrBeginner) {
                // continue; // 初参加 or チーム
                correctedRating = this.centerOfInnerRating;
            }
            // const innerRating: Rating = isTeamOrBeginner
            //     ? correctedRating
            //     : standingsEntry.UserScreenName in innerRatingsFromPredictor
            //         ? innerRatingsFromPredictor[standingsEntry.UserScreenName]
            //         : RatingConverter.toInnerRating(
            //             Math.max(RatingConverter.toRealRating(correctedRating), 1),
            //             standingsEntry.Competitions
            //         );
            const innerRating: Rating =
                standingsEntry.UserScreenName in innerRatingsFromPredictor
                    ? innerRatingsFromPredictor[standingsEntry.UserScreenName]
                    : this.centerOfInnerRating;

            if (isRated) {
                // ratedInnerRatings.push(innerRating);
                ratedUserRanks.push(standingsEntry.EntireRank);
                // if (innerRating || true) {
                const row: ScoreRow = [
                    innerRating,
                    standingsEntry.TotalResult.Score / 100,
                    standingsEntry.TotalResult.Elapsed + 300 * standingsEntry.TotalResult.Penalty,
                    userScores,
                    isRated,
                ];
                scores.push(row);
                if (
                    (DEBUG && standingsEntry.UserScreenName == DEBUG_USERNAME) ||
                    (!DEBUG && standingsEntry.UserScreenName == userScreenName)
                ) {
                    rowPtr = row;
                }
                // }
            }
        });

        const sameRatedRankCount = ratedUserRanks.reduce((prev: number, cur: number): number => {
            if (cur == yourStandingsEntry.EntireRank) prev++;
            return prev;
        }, 0);
        const ratedRank = ratedUserRanks.reduce((prev: number, cur: number): number => {
            if (cur < yourStandingsEntry.EntireRank) prev += 1;
            return prev;
        }, (1 + sameRatedRankCount) / 2);

        // レート順でソート
        scores.sort((a, b) => {
            const [innerRatingA, scoreA, timeElapsedA] = a;
            const [innerRatingB, scoreB, timeElapsedB] = b;
            if (innerRatingA != innerRatingB) {
                return innerRatingB - innerRatingA; // 降順（レートが高い順）
            }
            if (scoreA != scoreB) {
                return scoreB - scoreA; // 降順（順位が高い順）
            }
            return timeElapsedA - timeElapsedB; // 昇順（順位が高い順）
        });

        // const random = new Random(0);

        // スコア変化をシミュレート
        // (現レート，スコア合計，時間，問題ごとのスコア，rated)
        scores.forEach((score: ScoreRow) => {
            const [, , , scoresA] = score;
            // 自分は飛ばす
            if (score == rowPtr) return;
            for (let j = 0; j < tasks.length; ++j) {
                // if (random.nextInt(0, 9) <= 2) continue;
                // まだ満点ではなく，かつ正解者を増やせるなら
                if (scoresA[j] < highestScores[j] && rems[j] > 0) {
                    const dif = highestScores[j] - scoresA[j];
                    score[1] += dif;
                    score[2] += 1000000000 * 60 * 30; // とりあえず30分で解くと仮定する
                    scoresA[j] = highestScores[j];
                    rems[j]--;
                }
                if (rems[j] == 0) break;
            }
        });

        // 順位でソート
        scores.sort((a, b) => {
            const [innerRatingA, scoreA, timeElapsedA, ,] = a;
            const [innerRatingB, scoreB, timeElapsedB, ,] = b;
            if (scoreA != scoreB) {
                return scoreB - scoreA; // 降順（順位が高い順）
            }
            if (timeElapsedA != timeElapsedB) {
                return timeElapsedA - timeElapsedB; // 昇順（順位が高い順）
            }
            return innerRatingB - innerRatingA; // 降順（レートが高い順）
        });

        // 順位を求める
        let estimatedRank = -1;
        let rank = 0;
        let sameCnt = 0;
        for (let i = 0; i < scores.length; ++i) {
            if (estimatedRank == -1) {
                if (scores[i][4] === true) {
                    rank++;
                }
                if (scores[i] === rowPtr) {
                    if (rank === 0) rank = 1;
                    estimatedRank = rank;
                    // break;
                }
            } else {
                if (rowPtr === undefined) break;
                if (scores[i][1] === rowPtr[1] && scores[i][2] === rowPtr[2]) {
                    sameCnt++;
                } else {
                    break;
                }
            }
        } //1246
        estimatedRank += sameCnt / 2;
        // const dc = new DifficultyCalculator(ratedInnerRatings);

        // insert
        parent.insertAdjacentHTML(
            'beforeend',
            `
            <p><span class="h2">Performance</span></p>
            <div id="acssa-perf-table-wrapper">
                <table id="acssa-perf-table" class="table table-bordered table-hover th-center td-center td-middle acssa-table">
                <tbody>
                    <tr class="acssa-thead">
                        ${isEstimationEnabled ? '<td></td>' : ''}
                        <td id="acssa-thead-perf" class="acssa-thead">perf</td>
                        <td id="acssa-thead-perf" class="acssa-thead">レート変化</td>
                    </tr>
                </tbody>
                <tbody>
                    <tr id="acssa-perf-tbody" class="acssa-tbody"></tr>
                    ${
                        isEstimationEnabled
                            ? `
                        <tr id="acssa-perf-tbody-predicted" class="acssa-tbody"></tr>
                    `
                            : ''
                    }
                    </tbody>
                </table>
            </div>
        `
        );
        if (isEstimationEnabled) {
            (document.getElementById(`acssa-perf-tbody`) as HTMLElement).insertAdjacentHTML(
                'beforeend',
                `<th>Current</td>`
            );
            (document.getElementById(`acssa-perf-tbody-predicted`) as HTMLElement).insertAdjacentHTML(
                'beforeend',
                `<th>Predicted</td>`
            );
        }

        // build
        const id = `td-assa-perf-current`;
        // TODO: ちゃんと判定する
        // const perf = Math.min(2400, dc.rank2InnerPerf(ratedRank));
        const perf = RatingConverter.toCorrectedRating(dcForPerformance.rank2InnerPerf(ratedRank));
        //
        (document.getElementById(`acssa-perf-tbody`) as HTMLElement).insertAdjacentHTML(
            'beforeend',
            `
            <td id="${id}" style="color:${getColor(perf)};">
            ${perf === 9999 ? '-' : perf}</td>
        `
        );
        if (perf !== 9999) {
            (document.getElementById(id) as HTMLElement).insertAdjacentHTML(
                'afterbegin',
                generateDifficultyCircle(perf)
            );
            const oldRating = useRating ? yourStandingsEntry.Rating : yourStandingsEntry.OldRating;
            // const oldRating = yourStandingsEntry.Rating;
            const nextRating = Math.round(
                RatingConverter.toCorrectedRating(
                    calcRatingFromLast(RatingConverter.toRealRating(oldRating), perf, yourStandingsEntry.Competitions)
                )
            );
            const sign = nextRating > oldRating ? '+' : nextRating < oldRating ? '-' : '±';
            (document.getElementById(`acssa-perf-tbody`) as HTMLElement).insertAdjacentHTML(
                'beforeend',
                `
                <td>
                <span style="font-weight:bold;color:${getColor(oldRating)}">${oldRating}</span> → 
                <span style="font-weight:bold;color:${getColor(nextRating)}">${nextRating}</span>
                <span style="color:gray">(${sign}${Math.abs(nextRating - oldRating)})</span>
                </td>
            `
            );
        }
        if (isEstimationEnabled) {
            if (estimatedRank != -1) {
                const perfEstimated = RatingConverter.toCorrectedRating(dcForPerformance.rank2InnerPerf(estimatedRank));
                const id2 = `td-assa-perf-predicted`;
                (document.getElementById(`acssa-perf-tbody-predicted`) as HTMLElement).insertAdjacentHTML(
                    'beforeend',
                    `
                <td id="${id2}" style="color:${getColor(perfEstimated)};">
                ${perfEstimated === 9999 ? '-' : perfEstimated}</td>
            `
                );
                if (perfEstimated !== 9999) {
                    (document.getElementById(id2) as HTMLElement).insertAdjacentHTML(
                        'afterbegin',
                        generateDifficultyCircle(perfEstimated)
                    );
                    const oldRating = useRating ? yourStandingsEntry.Rating : yourStandingsEntry.OldRating;
                    // const oldRating = yourStandingsEntry.Rating;
                    const nextRating = Math.round(
                        RatingConverter.toCorrectedRating(
                            calcRatingFromLast(
                                RatingConverter.toRealRating(oldRating),
                                perfEstimated,
                                yourStandingsEntry.Competitions
                            )
                        )
                    );
                    const sign = nextRating > oldRating ? '+' : nextRating < oldRating ? '-' : '±';
                    (document.getElementById(`acssa-perf-tbody-predicted`) as HTMLElement).insertAdjacentHTML(
                        'beforeend',
                        `
                        <td>
                        <span style="font-weight:bold;color:${getColor(oldRating)}">${oldRating}</span> → 
                        <span style="font-weight:bold;color:${getColor(nextRating)}">${nextRating}</span>
                        <span style="color:gray">(${sign}${Math.abs(nextRating - oldRating)})</span>
                        </td>
                    `
                    );
                }
            } else {
                (document.getElementById(`acssa-perf-tbody-predicted`) as HTMLElement).insertAdjacentHTML(
                    'beforeend',
                    '<td>?</td>'
                );
            }
        }
    }
}
