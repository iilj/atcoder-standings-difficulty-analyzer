import Plotly = require('plotly.js');
import html from './charts.html';
import { ElapsedSeconds, Score, TaskInfoEntry } from '../interfaces/Standings';
import { arrayLowerBound, formatTimespan, getContestDurationSec } from '../utils';
import { DifficultyCalculator } from '../utils/DifficultyCalculator';
import { RatingConverter } from '../utils/RatingConverter';
import { Tabs } from './Tabs';
import { DEBUG, DEBUG_USERNAME } from './debug';

const LOADER_ID = 'acssa-loader' as const;
export const plotlyDifficultyChartId = 'acssa-mydiv-difficulty' as const;
export const plotlyAcceptedCountChartId = 'acssa-mydiv-accepted-count' as const;
export const plotlyLastAcceptedTimeChartId = 'acssa-mydiv-accepted-time' as const;

interface PlotlyConfigEx extends Plotly.Config {
    autosize: boolean;
}

const yourMarker: Partial<Plotly.PlotMarker> = {
    size: 10,
    symbol: 'cross',
    color: 'red',
    line: {
        color: 'white',
        width: 1,
    },
};
const config: Partial<PlotlyConfigEx> = { autosize: true };

// 背景用設定
const alpha = 0.3;
const colors: [number, number, string][] = [
    [0, 400, `rgba(128,128,128,${alpha})`],
    [400, 800, `rgba(128,0,0,${alpha})`],
    [800, 1200, `rgba(0,128,0,${alpha})`],
    [1200, 1600, `rgba(0,255,255,${alpha})`],
    [1600, 2000, `rgba(0,0,255,${alpha})`],
    [2000, 2400, `rgba(255,255,0,${alpha})`],
    [2400, 2800, `rgba(255,165,0,${alpha})`],
    [2800, 10000, `rgba(255,0,0,${alpha})`],
];

export class Charts {
    tasks: TaskInfoEntry[];

    scoreLastAcceptedTimeMap: Map<Score, ElapsedSeconds[]>;
    taskAcceptedCounts: number[];
    taskAcceptedElapsedTimes: ElapsedSeconds[][];
    yourTaskAcceptedElapsedTimes: ElapsedSeconds[];
    yourScore: Score;
    yourLastAcceptedTime: ElapsedSeconds;
    participants: number;

    dcForDifficulty: DifficultyCalculator;
    dcForPerformance: DifficultyCalculator;
    ratedRank2EntireRank: number[];
    tabs: Tabs;

    duration: number;
    xtick: number;

    constructor(
        parent: HTMLDivElement,
        tasks: TaskInfoEntry[],
        scoreLastAcceptedTimeMap: Map<Score, ElapsedSeconds[]>,
        taskAcceptedCounts: number[],
        taskAcceptedElapsedTimes: ElapsedSeconds[][],
        yourTaskAcceptedElapsedTimes: ElapsedSeconds[],
        yourScore: Score,
        yourLastAcceptedTime: ElapsedSeconds,
        participants: number,
        dcForDifficulty: DifficultyCalculator,
        dcForPerformance: DifficultyCalculator,
        ratedRank2EntireRank: number[],
        tabs: Tabs
    ) {
        this.tasks = tasks;

        this.scoreLastAcceptedTimeMap = scoreLastAcceptedTimeMap;
        this.taskAcceptedCounts = taskAcceptedCounts;
        this.taskAcceptedElapsedTimes = taskAcceptedElapsedTimes;
        this.yourTaskAcceptedElapsedTimes = yourTaskAcceptedElapsedTimes;
        this.yourScore = yourScore;
        this.yourLastAcceptedTime = yourLastAcceptedTime;
        this.participants = participants;

        this.dcForDifficulty = dcForDifficulty;
        this.dcForPerformance = dcForPerformance;
        this.ratedRank2EntireRank = ratedRank2EntireRank;
        this.tabs = tabs;

        parent.insertAdjacentHTML('beforeend', html);

        this.duration = getContestDurationSec();
        this.xtick = 60 * 10 * Math.max(1, Math.ceil(this.duration / (60 * 10 * 20))); // 10 分を最小単位にする
    }

    async plotAsync(): Promise<void> {
        // 以降の計算は時間がかかる

        this.taskAcceptedElapsedTimes.forEach((ar) => {
            ar.sort((a, b) => a - b);
        });
        // 時系列データの準備
        const [difficultyChartData, acceptedCountChartData] = await this.getTimeSeriesChartData();

        // 得点と提出時間データの準備
        const [lastAcceptedTimeChartData, maxAcceptedTime] = this.getLastAcceptedTimeChartData();

        // 軸フォーマットをカスタムする
        this.overrideAxisFormat();

        // Difficulty Chart 描画
        await this.plotDifficultyChartData(difficultyChartData);

        // Accepted Count Chart 描画
        await this.plotAcceptedCountChartData(acceptedCountChartData);

        // LastAcceptedTime Chart 描画
        await this.plotLastAcceptedTimeChartData(lastAcceptedTimeChartData, maxAcceptedTime);
    }

    /** 時系列データの準備 */
    async getTimeSeriesChartData(): Promise<[Partial<Plotly.ScatterData>[], Partial<Plotly.ScatterData>[]]> {
        /** Difficulty Chart のデータ */
        const difficultyChartData: Partial<Plotly.ScatterData>[] = [];
        /** AC Count Chart のデータ */
        const acceptedCountChartData: Partial<Plotly.ScatterData>[] = [];
        const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

        for (let j = 0; j < this.tasks.length; ++j) {
            //
            const interval = Math.ceil(this.taskAcceptedCounts[j] / 140);
            const [taskAcceptedElapsedTimesForChart, taskAcceptedCountsForChart] = this.taskAcceptedElapsedTimes[
                j
            ].reduce(
                ([ar, arr], tm, idx) => {
                    const tmpInterval = Math.max(1, Math.min(Math.ceil(idx / 10), interval));
                    if (idx % tmpInterval == 0 || idx == this.taskAcceptedCounts[j] - 1) {
                        ar.push(tm);
                        arr.push(idx + 1);
                    }
                    return [ar, arr];
                },
                [[] as ElapsedSeconds[], [] as number[]]
            );

            const correctedDifficulties: number[] = [];
            let counter = 0;
            for (const taskAcceptedCountForChart of taskAcceptedCountsForChart) {
                correctedDifficulties.push(
                    this.dcForDifficulty.binarySearchCorrectedDifficulty(taskAcceptedCountForChart)
                );
                counter += 1;
                // 20回に1回setTimeout(0)でeventループに処理を移す
                if (counter % 20 == 0) {
                    await sleep(0);
                }
            }

            difficultyChartData.push({
                x: taskAcceptedElapsedTimesForChart,
                y: correctedDifficulties,
                type: 'scatter',
                name: `${this.tasks[j].Assignment}`,
            });
            acceptedCountChartData.push({
                x: taskAcceptedElapsedTimesForChart,
                y: taskAcceptedCountsForChart,
                type: 'scatter',
                name: `${this.tasks[j].Assignment}`,
            });
        }

        // 現在のユーザのデータを追加
        if (this.yourScore !== -1) {
            const yourAcceptedTimes: number[] = [];
            const yourAcceptedDifficulties: number[] = [];
            const yourAcceptedCounts: number[] = [];

            for (let j = 0; j < this.tasks.length; ++j) {
                if (this.yourTaskAcceptedElapsedTimes[j] !== -1) {
                    yourAcceptedTimes.push(this.yourTaskAcceptedElapsedTimes[j]);
                    const yourAcceptedCount =
                        arrayLowerBound(this.taskAcceptedElapsedTimes[j], this.yourTaskAcceptedElapsedTimes[j]) + 1;
                    yourAcceptedCounts.push(yourAcceptedCount);
                    yourAcceptedDifficulties.push(
                        this.dcForDifficulty.binarySearchCorrectedDifficulty(yourAcceptedCount)
                    );
                }
            }

            this.tabs.yourDifficultyChartData = {
                x: yourAcceptedTimes,
                y: yourAcceptedDifficulties,
                mode: 'markers',
                type: 'scatter',
                name: `${DEBUG ? DEBUG_USERNAME : userScreenName}`,
                marker: yourMarker,
            };
            this.tabs.yourAcceptedCountChartData = {
                x: yourAcceptedTimes,
                y: yourAcceptedCounts,
                mode: 'markers',
                type: 'scatter',
                name: `${DEBUG ? DEBUG_USERNAME : userScreenName}`,
                marker: yourMarker,
            };
            difficultyChartData.push(this.tabs.yourDifficultyChartData);
            acceptedCountChartData.push(this.tabs.yourAcceptedCountChartData);
        }

        return [difficultyChartData, acceptedCountChartData];
    }

    /** 得点と提出時間データの準備 */
    getLastAcceptedTimeChartData(): [Partial<Plotly.ScatterData>[], ElapsedSeconds] {
        const lastAcceptedTimeChartData: Partial<Plotly.ScatterData>[] = [];
        const scores: Score[] = [...this.scoreLastAcceptedTimeMap.keys()];
        scores.sort((a, b) => b - a);
        let acc = 0;
        let maxAcceptedTime: ElapsedSeconds = 0;
        scores.forEach((score) => {
            const lastAcceptedTimes: ElapsedSeconds[] = this.scoreLastAcceptedTimeMap.get(score) as ElapsedSeconds[];
            lastAcceptedTimes.sort((a, b) => a - b);
            const interval = Math.ceil(lastAcceptedTimes.length / 100);
            const lastAcceptedTimesForChart: ElapsedSeconds[] = lastAcceptedTimes.reduce((ar, tm, idx) => {
                if (idx % interval == 0 || idx == lastAcceptedTimes.length - 1) ar.push(tm);
                return ar;
            }, [] as ElapsedSeconds[]);
            const lastAcceptedTimesRanks = lastAcceptedTimes.reduce((ar: number[], tm, idx) => {
                if (idx % interval == 0 || idx == lastAcceptedTimes.length - 1) ar.push(acc + idx + 1);
                return ar;
            }, [] as number[]);

            lastAcceptedTimeChartData.push({
                x: lastAcceptedTimesRanks,
                y: lastAcceptedTimesForChart,
                type: 'scatter',
                name: `${score}`,
            });

            if (score === this.yourScore) {
                const lastAcceptedTimesRank = arrayLowerBound(lastAcceptedTimes, this.yourLastAcceptedTime);
                this.tabs.yourLastAcceptedTimeChartData = {
                    x: [acc + lastAcceptedTimesRank + 1],
                    y: [this.yourLastAcceptedTime],
                    mode: 'markers',
                    type: 'scatter',
                    name: `${DEBUG ? DEBUG_USERNAME : userScreenName}`,
                    marker: yourMarker,
                };
                this.tabs.yourLastAcceptedTimeChartDataIndex = lastAcceptedTimeChartData.length + 0;
                lastAcceptedTimeChartData.push(this.tabs.yourLastAcceptedTimeChartData);
            }

            acc += lastAcceptedTimes.length;
            if (lastAcceptedTimes[lastAcceptedTimes.length - 1] > maxAcceptedTime) {
                maxAcceptedTime = lastAcceptedTimes[lastAcceptedTimes.length - 1];
            }
        });

        return [lastAcceptedTimeChartData, maxAcceptedTime];
    }

    /**
     * 軸フォーマットをカスタムする
     * Support specifying a function for tickformat · Issue #1464 · plotly/plotly.js
     * https://github.com/plotly/plotly.js/issues/1464#issuecomment-498050894
     */
    overrideAxisFormat(): void {
        const org_locale = Plotly.d3.locale;
        Plotly.d3.locale = (locale) => {
            const result = org_locale(locale);
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const org_number_format = result.numberFormat;
            result.numberFormat = (format) => {
                if (format != 'TIME') {
                    return org_number_format(format);
                }
                return (x) => formatTimespan(x).toString();
            };
            return result;
        };
    }

    /** Difficulty Chart 描画 */
    async plotDifficultyChartData(difficultyChartData: Partial<Plotly.ScatterData>[]): Promise<void> {
        const maxAcceptedCount = this.taskAcceptedCounts.reduce((a, b) => Math.max(a, b));
        const yMax = RatingConverter.toCorrectedRating(this.dcForDifficulty.binarySearchCorrectedDifficulty(1));
        const yMin = RatingConverter.toCorrectedRating(
            this.dcForDifficulty.binarySearchCorrectedDifficulty(Math.max(2, maxAcceptedCount))
        );

        // 描画
        const layout: Partial<Plotly.Layout> = {
            title: 'Difficulty',
            xaxis: {
                dtick: this.xtick,
                tickformat: 'TIME',
                range: [0, this.duration],
                // title: { text: 'Elapsed' }
            },
            yaxis: {
                dtick: 400,
                tickformat: 'd',
                range: [
                    Math.max(0, Math.floor((yMin - 100) / 400) * 400),
                    Math.max(0, Math.ceil((yMax + 100) / 400) * 400),
                ],
                // title: { text: 'Difficulty' }
            },
            shapes: colors.map((c): Partial<Plotly.Shape> => {
                return {
                    type: 'rect',
                    layer: 'below',
                    xref: 'x',
                    yref: 'y',
                    x0: 0,
                    x1: this.duration,
                    y0: c[0],
                    y1: c[1],
                    line: { width: 0 },
                    fillcolor: c[2],
                };
            }),
            margin: {
                b: 60,
                t: 30,
            },
        };
        await Plotly.newPlot(plotlyDifficultyChartId, difficultyChartData, layout, config);

        window.addEventListener('resize', () => {
            if (this.tabs.activeTab == 0)
                void Plotly.relayout(plotlyDifficultyChartId, {
                    width: (document.getElementById(plotlyDifficultyChartId) as HTMLElement).clientWidth,
                });
        });
    }

    /** Accepted Count Chart 描画 */
    async plotAcceptedCountChartData(acceptedCountChartData: Partial<Plotly.ScatterData>[]): Promise<void> {
        this.tabs.acceptedCountYMax = this.participants;
        const rectSpans: [number, number, string][] = colors.reduce((ar, cur) => {
            const bottom = this.dcForDifficulty.perf2ExpectedAcceptedCount(cur[1]);
            if (bottom > this.tabs.acceptedCountYMax) return ar;
            const top =
                cur[0] == 0 ? this.tabs.acceptedCountYMax : this.dcForDifficulty.perf2ExpectedAcceptedCount(cur[0]);
            if (top < 0.5) return ar;
            ar.push([Math.max(0.5, bottom), Math.min(this.tabs.acceptedCountYMax, top), cur[2]]);
            return ar;
        }, [] as [number, number, string][]);
        // 描画
        const layout: Partial<Plotly.Layout> = {
            title: 'Accepted Count',
            xaxis: {
                dtick: this.xtick,
                tickformat: 'TIME',
                range: [0, this.duration],
                // title: { text: 'Elapsed' }
            },
            yaxis: {
                // type: 'log',
                // dtick: 100,
                tickformat: 'd',
                range: [0, this.tabs.acceptedCountYMax],
                // range: [
                //     Math.log10(0.5),
                //     Math.log10(acceptedCountYMax)
                // ],
                // title: { text: 'Difficulty' }
            },
            shapes: rectSpans.map((span) => {
                return {
                    type: 'rect',
                    layer: 'below',
                    xref: 'x',
                    yref: 'y',
                    x0: 0,
                    x1: this.duration,
                    y0: span[0],
                    y1: span[1],
                    line: { width: 0 },
                    fillcolor: span[2],
                };
            }),
            margin: {
                b: 60,
                t: 30,
            },
        };
        await Plotly.newPlot(plotlyAcceptedCountChartId, acceptedCountChartData, layout, config);

        window.addEventListener('resize', () => {
            if (this.tabs.activeTab == 1)
                void Plotly.relayout(plotlyAcceptedCountChartId, {
                    width: (document.getElementById(plotlyAcceptedCountChartId) as HTMLElement).clientWidth,
                });
        });
    }

    /** LastAcceptedTime Chart 描画 */
    async plotLastAcceptedTimeChartData(
        lastAcceptedTimeChartData: Partial<Plotly.ScatterData>[],
        maxAcceptedTime: ElapsedSeconds
    ): Promise<void> {
        const xMax = this.participants;
        // Rated 内のランクから，全体のランクへ変換する
        const convRatedRank2EntireRank = (ratedRank: number): number => {
            const intRatedRank = Math.floor(ratedRank);
            if (intRatedRank >= this.ratedRank2EntireRank.length) return xMax;
            return this.ratedRank2EntireRank[intRatedRank];
        };
        const yMax = Math.ceil((maxAcceptedTime + this.xtick / 2) / this.xtick) * this.xtick;
        const rectSpans: [number, number, string][] = colors.reduce((ar, cur) => {
            const right = cur[0] == 0 ? xMax : convRatedRank2EntireRank(this.dcForPerformance.perf2Ranking(cur[0]));
            if (right < 1) return ar;
            const left = cur[1] === 10000 ? 0 : convRatedRank2EntireRank(this.dcForPerformance.perf2Ranking(cur[1]));
            if (left > xMax) return ar;
            ar.push([Math.max(0, left), Math.min(xMax, right), cur[2]]);
            return ar;
        }, [] as [number, number, string][]);
        // console.log(colors);
        // console.log(rectSpans);
        const layout: Partial<Plotly.Layout> = {
            title: 'LastAcceptedTime v.s. Rank',
            xaxis: {
                // dtick: 100,
                tickformat: 'd',
                range: [0, xMax],
                // title: { text: 'Elapsed' }
            },
            yaxis: {
                dtick: this.xtick,
                tickformat: 'TIME',
                range: [0, yMax],
                // range: [
                //     Math.max(0, Math.floor((yMin - 100) / 400) * 400),
                //     Math.max(0, Math.ceil((yMax + 100) / 400) * 400)
                // ],
                // title: { text: 'Difficulty' }
            },
            shapes: rectSpans.map((span) => {
                return {
                    type: 'rect',
                    layer: 'below',
                    xref: 'x',
                    yref: 'y',
                    x0: span[0],
                    x1: span[1],
                    y0: 0,
                    y1: yMax,
                    line: { width: 0 },
                    fillcolor: span[2],
                };
            }),
            margin: {
                b: 60,
                t: 30,
            },
        };
        await Plotly.newPlot(plotlyLastAcceptedTimeChartId, lastAcceptedTimeChartData, layout, config);

        window.addEventListener('resize', () => {
            if (this.tabs.activeTab == 2)
                void Plotly.relayout(plotlyLastAcceptedTimeChartId, {
                    width: (document.getElementById(plotlyLastAcceptedTimeChartId) as HTMLElement).clientWidth,
                });
        });
    }

    hideLoader(): void {
        (document.getElementById(LOADER_ID) as HTMLElement).style.display = 'none';
    }
}
