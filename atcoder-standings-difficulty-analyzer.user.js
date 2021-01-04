// ==UserScript==
// @name         atcoder-standings-difficulty-analyzer
// @namespace    iilj
// @version      2021.1.4.0
// @description  順位表の得点情報を集計し，推定 difficulty やその推移を表示します．
// @author       iilj
// @supportURL   https://github.com/iilj/atcoder-standings-difficulty-analyzer/issues
// @match        https://atcoder.jp/*standings*
// @exclude      https://atcoder.jp/*standings/json
// @require      https://cdnjs.cloudflare.com/ajax/libs/plotly.js/1.33.1/plotly.min.js
// @resource     loaders.min.css https://cdnjs.cloudflare.com/ajax/libs/loaders.css/0.1.2/loaders.min.css
// @grant        GM_getResourceText
// @grant        GM_addStyle
// ==/UserScript==

/**
 * 問題ごとの結果エントリ
 * @typedef {Object} TaskResultEntry
 * @property {any} Additional 謎
 * @property {number} Count 提出回数
 * @property {number} Elapsed コンテスト開始からの経過時間 [ns].
 * @property {number} Failure 非 AC の提出数（ACするまではペナルティではない）．
 * @property {boolean} Frozen アカウントが凍結済みかどうか？
 * @property {number} Penalty ペナルティ数
 * @property {boolean} Pending ジャッジ中かどうか？
 * @property {number} Score 得点（×100）
 * @property {number} Status 1 のとき満点？ 6 のとき部分点？
 */

/**
 * 全問題の結果
 * @typedef {Object} TotalResultEntry
 * @property {number} Accepted 正解した問題数
 * @property {any} Additional 謎
 * @property {number} Count 提出回数
 * @property {number} Elapsed コンテスト開始からの経過時間 [ns].
 * @property {boolean} Frozen アカウントが凍結済みかどうか？
 * @property {number} Penalty ペナルティ数
 * @property {number} Score 得点（×100）
 */

/**
 * 順位表エントリ
 * @typedef {Object} StandingsEntry
 * @property {any} Additional 謎
 * @property {string} Affiliation 所属
 * @property {number} AtCoderRank AtCoder 内順位
 * @property {number} Competitions Rated コンテスト参加回数
 * @property {string} Country 国ラベル．"JP" など．
 * @property {string} DisplayName 表示名．"hitonanode" など．
 * @property {number} EntireRank コンテスト順位？
 * @property {boolean} IsRated Rated かどうか
 * @property {boolean} IsTeam チームかどうか
 * @property {number} OldRating コンテスト前のレーティング
 * @property {number} Rank コンテスト順位？
 * @property {number} Rating コンテスト後のレーティング
 * @property {{[key: string]: TaskResultEntry}} TaskResults 問題ごとの結果．参加登録していない人は空．
 * @property {TotalResultEntry} TotalResult 全体の結果
 * @property {boolean} UserIsDeleted ユーザアカウントが削除済みかどうか
 * @property {string} UserName ユーザ名．"hitonanode" など．
 * @property {string} UserScreenName ユーザの表示名．"hitonanode" など．
 */

/**
 * 問題エントリ
 * @typedef {Object} TaskInfoEntry
 * @property {string} Assignment 問題ラベル．"A" など．
 * @property {string} TaskName 問題名．
 * @property {string} TaskScreenName 問題の slug. "abc185_a" など．
 */

/**
 * 順位表情報
 * @typedef {Object} Standings
 * @property {any} AdditionalColumns 謎
 * @property {boolean} Fixed 謎
 * @property {StandingsEntry[]} StandingsData 順位表データ
 * @property {TaskInfoEntry[]} TaskInfo 問題データ
 */

/* globals vueStandings, $, contestScreenName, startTime, endTime, userScreenName, Plotly */

(() => {
    'use strict';

    // loader のスタイル設定
    const loaderStyles = GM_getResourceText("loaders.min.css");
    const loaderWrapperStyles = `
#acssa-table {
    width: 100%;
    table-layout: fixed;
    margin-bottom: 1.5rem;
}
#acssa-thead {
    font-weight: bold;
}
.acssa-loader-wrapper {
    background-color: #337ab7;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1rem;
    margin-bottom: 1.5rem;
    border-radius: 3px;
}
#acssa-chart-tab {
    margin-bottom: 0.5rem;
}
#acssa-chart-tab a {
    cursor: pointer;
}
#acssa-chart-tab span.glyphicon {
    margin-right: 0.5rem;
}
.acssa-chart-wrapper {
    display: none;
}
.acssa-chart-wrapper.acssa-chart-wrapper-active {
    display: block;
}
    `;
    GM_addStyle(loaderStyles + loaderWrapperStyles);

    class RatingConverter {
        /** 表示用の低レート帯補正レート → 低レート帯補正前のレート
         * @type {(correctedRating: number) => number} */
        static toRealRating = (correctedRating) => {
            if (correctedRating >= 400) return correctedRating;
            else return 400 * (1 - Math.log(400 / correctedRating));
        };

        /** 低レート帯補正前のレート → 内部レート推定値
         * @type {(correctedRating: number) => number} */
        static toInnerRating = (realRating, comp) => {
            return realRating + 1200 * (Math.sqrt(1 - Math.pow(0.81, comp)) / (1 - Math.pow(0.9, comp)) - 1) / (Math.sqrt(19) - 1);
        };

        /** 低レート帯補正前のレート → 表示用の低レート帯補正レート
         * @type {(correctedRating: number) => number} */
        static toCorrectedRating = (realRating) => {
            if (realRating >= 400) return realRating;
            else return Math.floor(400 / Math.exp((400 - realRating) / 400));
        };
    }

    class DifficultyCalculator {
        /** @constructor
         * @type {(sortedInnerRatings: number[]) => DifficultyCalculator}
         */
        constructor(sortedInnerRatings) {
            this.innerRatings = sortedInnerRatings;
            /** @type {Map<number, number>} */
            this.prepared = new Map();
            /** @type {Map<number, number>} */
            this.memo = new Map();
        }

        perf2ExpectedAcceptedCount = (m) => {
            let expectedAcceptedCount;
            if (this.prepared.has(m)) {
                expectedAcceptedCount = this.prepared.get(m);
            } else {
                expectedAcceptedCount = this.innerRatings.reduce((prev_expected_accepts, innerRating) =>
                    prev_expected_accepts += 1 / (1 + Math.pow(6, (m - innerRating) / 400)), 0);
                this.prepared.set(m, expectedAcceptedCount);
            }
            return expectedAcceptedCount;
        };

        perf2Ranking = (x) => this.perf2ExpectedAcceptedCount(x) + 0.5;

        /** Difficulty 推定値を算出する
         *  @type {((acceptedCount: number) => number)} */
        binarySearch = (acceptedCount) => {
            if (this.memo.has(acceptedCount)) {
                return this.memo.get(acceptedCount);
            }
            let lb = -10000;
            let ub = 10000;
            while (ub - lb > 1) {
                const m = Math.floor((ub + lb) / 2);
                const expectedAcceptedCount = this.perf2ExpectedAcceptedCount(m);

                if (expectedAcceptedCount < acceptedCount) ub = m;
                else lb = m;
            }
            const difficulty = lb
            const correctedDifficulty = RatingConverter.toCorrectedRating(difficulty);
            this.memo.set(acceptedCount, correctedDifficulty);
            return correctedDifficulty;
        };
    }

    /** @type {(rating: number) => string} */
    const getColor = (rating) => {
        if (rating < 400) return '#808080'; //          gray
        else if (rating < 800) return '#804000'; //     brown
        else if (rating < 1200) return '#008000'; //    green
        else if (rating < 1600) return '#00C0C0'; //    cyan
        else if (rating < 2000) return '#0000FF'; //    blue
        else if (rating < 2400) return '#C0C000'; //    yellow
        else if (rating < 2800) return '#FF8000'; //    orange
        else if (rating == 9999) return '#000000';
        return '#FF0000'; //                            red
    };

    /** レートを表す難易度円(◒)の HTML 文字列を生成
     *  @type {(rating: number, isSmall?: boolean) => string} */
    const generateDifficultyCircle = (rating, isSmall = true) => {
        const size = (isSmall ? 12 : 36);
        const borderWidth = (isSmall ? 1 : 3);

        const style = `display:inline-block;border-radius:50%;border-style:solid;border-width:${borderWidth}px;`
            + `margin-right:5px;vertical-align:initial;height:${size}px;width:${size}px;`;

        if (rating < 3200) {
            // 色と円がどのぐらい満ちているかを計算
            const color = getColor(rating);
            const percentFull = (rating % 400) / 400 * 100;

            // ◒を生成
            return `
                <span style='${style}border-color:${color};background:`
                + `linear-gradient(to top, ${color} 0%, ${color} ${percentFull}%, `
                + `rgba(0, 0, 0, 0) ${percentFull}%, rgba(0, 0, 0, 0) 100%); '>
                </span>`;

        }
        // 金銀銅は例外処理
        else if (rating < 3600) {
            return `<span style="${style}border-color: rgb(150, 92, 44);`
                + 'background: linear-gradient(to right, rgb(150, 92, 44), rgb(255, 218, 189), rgb(150, 92, 44));"></span>';
        } else if (rating < 4000) {
            return `<span style="${style}border-color: rgb(128, 128, 128);`
                + 'background: linear-gradient(to right, rgb(128, 128, 128), white, rgb(128, 128, 128));"></span>';
        } else {
            return `<span style="${style}border-color: rgb(255, 215, 0);`
                + 'background: linear-gradient(to right, rgb(255, 215, 0), white, rgb(255, 215, 0));"></span>';
        }
    }

    /** @type {(sec: number) => string} */
    const formatTimespan = (sec) => {
        let sign;
        if (sec >= 0) {
            sign = "";
        } else {
            sign = "-";
            sec *= -1;
        }
        return `${sign}${Math.floor(sec / 60)}:${`0${sec % 60}`.slice(-2)}`;
    };

    /** 現在のページから，コンテストの開始から終了までの秒数を抽出する
     * @type {() => number}
     */
    const getContestDurationSec = () => (endTime - startTime) / 1000;

    let working = false;

    /** 順位表更新時の処理：テーブル追加
     *  @type {(v: Standings) => void} */
    const onStandingsChanged = async (standings) => {
        if (!standings) return;
        if (working) return;
        working = true;

        { // remove old contents
            const oldContents = document.getElementById("acssa-contents");
            if (oldContents) {
                // oldContents.parentNode.removeChild(oldContents);
                oldContents.remove();
            }
        }

        const tasks = standings.TaskInfo;
        const standingsData = standings.StandingsData; // vueStandings.filteredStandings;
        // console.log(tasks, standingsData);

        /** @type {Map<number, number[]>} */
        const scoreLastAcceptedTimeMap = new Map();

        // コンテスト中かどうか判別する
        let isDuringContest = true;
        for (let i = 0; i < standingsData.length; ++i) {
            const standingsEntry = standingsData[i];
            if (standingsEntry.OldRating > 0) {
                isDuringContest = false;
                break;
            }
        }

        /** 各問題の正答者数．
         * @type {number[]} */
        const taskAcceptedCounts = Array(tasks.length);
        taskAcceptedCounts.fill(0);

        /** 各問題の正答時間リスト．秒単位で格納する．
         * @type {number[][]} */
        const taskAcceptedElapsedTimes = [...Array(tasks.length)].map((_, i) => []);
        // taskAcceptedElapsedTimes.fill([]); // これだと同じインスタンスで埋めてしまう

        /** 内部レートのリスト．
         * @type {number[]} */
        const innerRatings = [];

        const NS2SEC = 1000000000;

        /** @type {{[key: string]: number}} */
        const innerRatingsFromPredictor = await (await fetch(`https://data.ac-predictor.com/aperfs/${contestScreenName}.json`)).json();

        // 順位表情報を走査する（内部レートのリストと正答時間リストを構築する）
        let participants = 0;
        for (let i = 0; i < standingsData.length; ++i) {
            const standingsEntry = standingsData[i];

            if (!standingsEntry.TaskResults) continue; // 参加登録していない
            if (standingsEntry.UserIsDeleted) continue; // アカウント削除
            const correctedRating = isDuringContest ? standingsEntry.Rating : standingsEntry.OldRating;
            if (correctedRating === 0) continue; // 初参加
            participants++;

            // これは飛ばしちゃダメ（提出しても 0 AC だと Penalty == 0 なので）
            // if (standingsEntry.TotalResult.Score == 0 && standingsEntry.TotalResult.Penalty == 0) continue;

            let score = 0;
            let penalty = 0;
            for (let j = 0; j < tasks.length; ++j) {
                const taskResultEntry = standingsEntry.TaskResults[tasks[j].TaskScreenName];
                if (!taskResultEntry) continue; // 未提出
                score += taskResultEntry.Score;
                penalty += (taskResultEntry.Score === 0 ? taskResultEntry.Failure : taskResultEntry.Penalty);
            }
            if (score === 0 && penalty === 0) continue; // NoSub を飛ばす
            // console.log(i + 1, score, penalty);

            score /= 100;
            if (scoreLastAcceptedTimeMap.has(score)) {
                scoreLastAcceptedTimeMap.get(score).push(standingsEntry.TotalResult.Elapsed / NS2SEC)
            } else {
                scoreLastAcceptedTimeMap.set(score, [standingsEntry.TotalResult.Elapsed / NS2SEC]);
            }

            const innerRating = (standingsEntry.UserScreenName in innerRatingsFromPredictor)
                ? innerRatingsFromPredictor[standingsEntry.UserScreenName]
                : RatingConverter.toInnerRating(
                    Math.max(RatingConverter.toRealRating(correctedRating), 1), standingsEntry.Competitions);
            if (innerRating) innerRatings.push(innerRating);
            else {
                console.log(i, innerRating, rating, standingsEntry.Competitions);
                continue;
            }
            for (let j = 0; j < tasks.length; ++j) {
                const taskResultEntry = standingsEntry.TaskResults[tasks[j].TaskScreenName];
                const isAccepted = (taskResultEntry?.Score > 0 && taskResultEntry?.Status == 1);
                if (isAccepted) {
                    ++taskAcceptedCounts[j];
                    taskAcceptedElapsedTimes[j].push(taskResultEntry.Elapsed / NS2SEC);
                }
            }
        }
        innerRatings.sort((a, b) => a - b);

        const dc = new DifficultyCalculator(innerRatings);

        const plotlyDifficultyChartId = 'acssa-mydiv-difficulty';
        const plotlyLastAcceptedCountChartId = 'acssa-mydiv-accepted-count';
        const plotlyLastAcceptedTimeChartId = 'acssa-mydiv-accepted-time';
        $('#vue-standings').prepend(`
        <div id="acssa-contents">
          <table id="acssa-table" class="table table-bordered table-hover th-center td-center td-middle">
            <tbody>
              <tr id="acssa-thead"></tr>
            </tbody>
            <tbody>
              <tr id="acssa-tbody"></tr>
            </tbody>
          </table>
          <ul class="nav nav-pills small" id="acssa-chart-tab">
            <li class="active">
              <a class="acssa-chart-tab-button"><span class="glyphicon glyphicon-stats" aria-hidden="true"></span>Difficulty</a></li>
            <li>
              <a class="acssa-chart-tab-button"><span class="glyphicon glyphicon-stats" aria-hidden="true"></span>AC Count</a></li>
            <li>
              <a class="acssa-chart-tab-button"><span class="glyphicon glyphicon-stats" aria-hidden="true"></span>LastAcceptedTime</a></li>
		  </ul>
          <div id="acssa-loader" class="loader acssa-loader-wrapper">
            <div class="loader-inner ball-pulse">
                <div></div>
                <div></div>
                <div></div>
            </div>
          </div>
          <div id="acssa-chart-block">
            <div class="acssa-chart-wrapper acssa-chart-wrapper-active" id="${plotlyDifficultyChartId}-wrapper">
                <div id="${plotlyDifficultyChartId}" style="width:100%;"></div>
            </div>
            <div class="acssa-chart-wrapper" id="${plotlyLastAcceptedCountChartId}-wrapper">
                <div id="${plotlyLastAcceptedCountChartId}" style="width:100%;"></div>
            </div>
            <div class="acssa-chart-wrapper" id="${plotlyLastAcceptedTimeChartId}-wrapper">
                <div id="${plotlyLastAcceptedTimeChartId}" style="width:100%;"></div>
            </div>
          </div>
        </div>
        `);

        let activeTab = 0;
        document.querySelectorAll(".acssa-chart-tab-button").forEach((btn, key) => {
            btn.addEventListener("click", () => {
                // check whether active or not
                if (btn.parentElement.className == "active") return;
                // modify visibility
                activeTab = key;
                document.querySelector("#acssa-chart-tab li.active").classList.remove("active");
                document.querySelector(`#acssa-chart-tab li:nth-child(${key + 1})`).classList.add("active");
                document.querySelector("#acssa-chart-block div.acssa-chart-wrapper-active").classList.remove("acssa-chart-wrapper-active");
                document.querySelector(`#acssa-chart-block div.acssa-chart-wrapper:nth-child(${key + 1})`).classList.add("acssa-chart-wrapper-active");
                // resize charts
                switch (key) {
                    case 0:
                        Plotly.relayout(plotlyDifficultyChartId, { width: document.getElementById(plotlyDifficultyChartId).clientWidth });
                        break;
                    case 1:
                        Plotly.relayout(plotlyLastAcceptedCountChartId, { width: document.getElementById(plotlyLastAcceptedCountChartId).clientWidth });
                        break;
                    case 2:
                        Plotly.relayout(plotlyLastAcceptedTimeChartId, { width: document.getElementById(plotlyLastAcceptedTimeChartId).clientWidth });
                        break;
                    default:
                        break;
                }
            });
        });

        // 現在の Difficulty テーブルを構築する
        for (let j = 0; j < tasks.length; ++j) {
            const correctedDifficulty = RatingConverter.toCorrectedRating(dc.binarySearch(taskAcceptedCounts[j]));
            document.getElementById("acssa-thead").insertAdjacentHTML("beforeend", `
                <td>${tasks[j].Assignment}</td>
            `);
            const id = `td-assa-difficulty-${j}`;
            document.getElementById("acssa-tbody").insertAdjacentHTML("beforeend", `
                <td id="${id}" style="color:${getColor(correctedDifficulty)};">
                ${correctedDifficulty === 9999 ? '-' : correctedDifficulty}</td>
            `);
            if (correctedDifficulty !== 9999) {
                document.getElementById(id).insertAdjacentHTML(
                    "afterbegin", generateDifficultyCircle(correctedDifficulty));
            }
        }

        // 順位表のその他の描画を優先するために，後回しにする
        setTimeout(() => {
            const maxAcceptedCount = taskAcceptedCounts.reduce((a, b) => Math.max(a, b));
            const yMax = RatingConverter.toCorrectedRating(dc.binarySearch(1));
            const yMin = RatingConverter.toCorrectedRating(dc.binarySearch(Math.max(2, maxAcceptedCount)));

            // 以降の計算は時間がかかる

            taskAcceptedElapsedTimes.forEach(ar => {
                ar.sort((a, b) => a - b);
            });

            // 時系列データの準備
            /** @type {{x: number, y: number, type: string, name: string}[]} */
            const difficultyChartData = [];
            const acceptedCountChartData = [];
            for (let j = 0; j < tasks.length; ++j) { // 
                const interval = Math.ceil(taskAcceptedCounts[j] / 160);
                /** @type {number[]} */
                const taskAcceptedElapsedTimesForChart = taskAcceptedElapsedTimes[j].reduce((ar, tm, idx) => {
                    if (idx % interval == 0 || idx == taskAcceptedCounts[j] - 1) ar.push(tm);
                    return ar;
                }, []);

                difficultyChartData.push({
                    x: taskAcceptedElapsedTimesForChart,
                    y: taskAcceptedElapsedTimesForChart.map((_, i) => dc.binarySearch(interval * i + 1)),
                    type: 'scatter',
                    name: `${tasks[j].Assignment}`,
                });
                acceptedCountChartData.push({
                    x: taskAcceptedElapsedTimesForChart,
                    y: taskAcceptedElapsedTimesForChart.map((_, i) => (interval * i + 1)),
                    type: 'scatter',
                    name: `${tasks[j].Assignment}`,
                });
            }

            // 得点と提出時間データの準備
            /** @type {{x: number, y: number, type: string, name: string}[]} */
            const lastAcceptedTimeChartData = [];
            const scores = [...scoreLastAcceptedTimeMap.keys()];
            scores.sort((a, b) => b - a);
            let acc = 0;
            let maxAcceptedTime = 0;
            scores.forEach(score => {
                const lastAcceptedTimes = scoreLastAcceptedTimeMap.get(score);
                lastAcceptedTimes.sort((a, b) => a - b);
                const interval = Math.ceil(lastAcceptedTimes.length / 100);
                /** @type {number[]} */
                const lastAcceptedTimesForChart = lastAcceptedTimes.reduce((ar, tm, idx) => {
                    if (idx % interval == 0 || idx == lastAcceptedTimes.length - 1) ar.push(tm);
                    return ar;
                }, []);
                const lastAcceptedTimesRanks = lastAcceptedTimes.reduce((ar, tm, idx) => {
                    if (idx % interval == 0 || idx == lastAcceptedTimes.length - 1) ar.push(acc + idx + 1);
                    return ar;
                }, []);

                lastAcceptedTimeChartData.push({
                    x: lastAcceptedTimesRanks,
                    y: lastAcceptedTimesForChart,
                    type: 'scatter',
                    name: `${score}`,
                });

                acc += lastAcceptedTimes.length;
                if (lastAcceptedTimes[lastAcceptedTimes.length - 1] > maxAcceptedTime) {
                    maxAcceptedTime = lastAcceptedTimes[lastAcceptedTimes.length - 1];
                }
            });

            // 軸フォーマットをカスタムする
            // Support specifying a function for tickformat · Issue #1464 · plotly/plotly.js
            // https://github.com/plotly/plotly.js/issues/1464#issuecomment-498050894
            {
                const org_locale = Plotly.d3.locale;
                Plotly.d3.locale = (locale) => {
                    const result = org_locale(locale);
                    const org_number_format = result.numberFormat;
                    result.numberFormat = (format) => {
                        if (format != 'TIME') {
                            return org_number_format(format)
                        }
                        return (x) => formatTimespan(x).toString();
                    }
                    return result;
                };
            }

            // 背景用設定
            const alpha = 0.3;
            /** @type {[number, number, string][]} */
            const colors = [
                [0, 400, `rgba(128,128,128,${alpha})`],
                [400, 800, `rgba(128,0,0,${alpha})`],
                [800, 1200, `rgba(0,128,0,${alpha})`],
                [1200, 1600, `rgba(0,255,255,${alpha})`],
                [1600, 2000, `rgba(0,0,255,${alpha})`],
                [2000, 2400, `rgba(255,255,0,${alpha})`],
                [2400, 2800, `rgba(255,165,0,${alpha})`],
                [2800, 10000, `rgba(255,0,0,${alpha})`],
            ];

            // Difficulty Chart 描画
            {
                // 描画
                const duration = getContestDurationSec();
                const layout = {
                    title: 'Difficulty',
                    xaxis: {
                        dtick: 60 * 10,
                        tickformat: 'TIME',
                        range: [0, duration],
                        // title: { text: 'Elapsed' }
                    },
                    yaxis: {
                        dtick: 400,
                        tickformat: 'd',
                        range: [
                            Math.max(0, Math.floor((yMin - 100) / 400) * 400),
                            Math.max(0, Math.ceil((yMax + 100) / 400) * 400)
                        ],
                        // title: { text: 'Difficulty' }
                    },
                    shapes: colors.map(c => {
                        return {
                            type: 'rect',
                            layer: 'below',
                            xref: 'x',
                            yref: 'y',
                            x0: 0,
                            x1: duration,
                            y0: c[0],
                            y1: c[1],
                            line: { width: 0 },
                            fillcolor: c[2]
                        };
                    }),
                    margin: {
                        b: 60,
                        t: 30,
                    }
                };
                const config = { autosize: true };
                Plotly.newPlot(plotlyDifficultyChartId, difficultyChartData, layout, config);

                window.addEventListener('resize', () => {
                    if (activeTab == 0)
                        Plotly.relayout(plotlyDifficultyChartId, { width: document.getElementById(plotlyDifficultyChartId).clientWidth });
                });
            }

            // Accepted Count Chart 描画
            {
                const yMax = participants;
                /** @type {[number, number, string][]} */
                const rectSpans = colors.reduce((ar, cur) => {
                    const bottom = dc.perf2ExpectedAcceptedCount(cur[1]);
                    if (bottom > yMax) return ar;
                    const top = (cur[0] == 0) ? yMax : dc.perf2ExpectedAcceptedCount(cur[0]);
                    ar.push([Math.max(0, bottom), Math.min(yMax, top), cur[2]]);
                    return ar;
                }, []);
                // 描画
                const duration = getContestDurationSec();
                const layout = {
                    title: 'Accepted Count',
                    xaxis: {
                        dtick: 60 * 10,
                        tickformat: 'TIME',
                        range: [0, duration],
                        // title: { text: 'Elapsed' }
                    },
                    yaxis: {
                        // dtick: 100,
                        tickformat: 'd',
                        range: [
                            0,
                            yMax
                        ],
                        // title: { text: 'Difficulty' }
                    },
                    shapes: rectSpans.map(span => {
                        return {
                            type: 'rect',
                            layer: 'below',
                            xref: 'x',
                            yref: 'y',
                            x0: 0,
                            x1: duration,
                            y0: span[0],
                            y1: span[1],
                            line: { width: 0 },
                            fillcolor: span[2]
                        };
                    }),
                    margin: {
                        b: 60,
                        t: 30,
                    }
                };
                const config = { autosize: true };
                Plotly.newPlot(plotlyLastAcceptedCountChartId, acceptedCountChartData, layout, config);

                window.addEventListener('resize', () => {
                    if (activeTab == 1)
                        Plotly.relayout(plotlyLastAcceptedCountChartId, { width: document.getElementById(plotlyLastAcceptedCountChartId).clientWidth });
                });
            }

            // LastAcceptedTime Chart 描画
            {
                const xMax = participants;
                const yMax = Math.ceil((maxAcceptedTime + 60 * 5) / (60 * 10)) * (60 * 10);
                /** @type {[number, number, string][]} */
                const rectSpans = colors.reduce((ar, cur) => {
                    const right = (cur[0] == 0) ? xMax : dc.perf2Ranking(cur[0]);
                    if (right < 1) return ar;
                    const left = dc.perf2Ranking(cur[1]);
                    if (left > xMax) return ar;
                    ar.push([Math.max(0, left), Math.min(xMax, right), cur[2]]);
                    return ar;
                }, []);
                // console.log(colors);
                // console.log(rectSpans);
                const layout = {
                    title: 'LastAcceptedTime v.s. Rank',
                    xaxis: {
                        // dtick: 100,
                        tickformat: 'd',
                        range: [0, xMax],
                        // title: { text: 'Elapsed' }
                    },
                    yaxis: {
                        dtick: 60 * 10,
                        tickformat: 'TIME',
                        range: [0, yMax],
                        // range: [
                        //     Math.max(0, Math.floor((yMin - 100) / 400) * 400),
                        //     Math.max(0, Math.ceil((yMax + 100) / 400) * 400)
                        // ],
                        // title: { text: 'Difficulty' }
                    },
                    shapes: rectSpans.map(span => {
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
                            fillcolor: span[2]
                        };
                    }),
                    margin: {
                        b: 60,
                        t: 30,
                    }
                };
                const config = { autosize: true };
                Plotly.newPlot(plotlyLastAcceptedTimeChartId, lastAcceptedTimeChartData, layout, config);

                window.addEventListener('resize', () => {
                    if (activeTab == 2)
                        Plotly.relayout(plotlyLastAcceptedTimeChartId, { width: document.getElementById(plotlyLastAcceptedTimeChartId).clientWidth });
                });
            }

            document.getElementById('acssa-loader').style.display = 'none';
            working = false;
        }, 100); // end setTimeout()
    };

    // MAIN
    vueStandings.$watch('standings', onStandingsChanged, { deep: true, immediate: true });

})();
