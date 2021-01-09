// ==UserScript==
// @name         atcoder-standings-difficulty-analyzer
// @namespace    iilj
// @version      2021.1.9.0
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
 * @property {string} Affiliation 所属．IsTeam = true のときは，チームメンバを「, 」で結合した文字列．
 * @property {number} AtCoderRank AtCoder 内順位
 * @property {number} Competitions Rated コンテスト参加回数
 * @property {string} Country 国ラベル．"JP" など．
 * @property {string} DisplayName 表示名．"hitonanode" など．
 * @property {number} EntireRank コンテスト順位？
 * @property {boolean} IsRated Rated かどうか
 * @property {boolean} IsTeam チームかどうか
 * @property {number} OldRating コンテスト前のレーティング．コンテスト後のみ有効．
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
#acssa-tab-wrapper {
    display: none;
}
#acssa-chart-tab, #acssa-checkbox-tab {
    margin-bottom: 0.5rem;
    display: inline-block;
}
#acssa-chart-tab a, #acssa-checkbox-tab label, #acssa-checkbox-tab label input {
    cursor: pointer;
}
#acssa-chart-tab span.glyphicon {
    margin-right: 0.5rem;
}
#acssa-checkbox-tab label, #acssa-checkbox-tab input {
    margin: 0;
}
#acssa-checkbox-tab li a {
    color: black;
}
#acssa-checkbox-tab li a:hover {
    background-color: transparent;
}
.acssa-chart-wrapper {
    display: none;
}
.acssa-chart-wrapper.acssa-chart-wrapper-active {
    display: block;
}
.acssa-task-checked {
    color: green;
    margin-left: 0.5rem;
}
#acssa-checkbox-toggle-log-plot-parent {
    display: none;
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

    /** @type {(ar: number[], n: number) => number} */
    const arrayLowerBound = (arr, n) => {
        let first = 0, last = arr.length - 1, middle;
        while (first <= last) {
            middle = 0 | (first + last) / 2;
            if (arr[middle] < n) first = middle + 1;
            else last = middle - 1;
        }
        return first;
    };

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
    const getContestDurationSec = () => {
        if (contestScreenName.startsWith("past")) {
            return 300 * 60;
        }
        return (endTime - startTime) / 1000;
    };

    /** @type {(contestScreenName: string) => number} */
    const getCenterOfInnerRating = (contestScreenName) => {
        if (contestScreenName.startsWith("agc")) {
            const contestNumber = Number(contestScreenName.substring(3, 6));
            return (contestNumber >= 34) ? 1200 : 1600;
        }
        if (contestScreenName.startsWith("arc")) {
            const contestNumber = Number(contestScreenName.substring(3, 6));
            return (contestNumber >= 104) ? 1000 : 1600;
        }
        return 800;
    };
    const centerOfInnerRating = getCenterOfInnerRating(contestScreenName);

    let working = false;
    let oldStandingsData = null;

    /** 順位表更新時の処理：テーブル追加
     *  @type {(v: Standings) => void} */
    const onStandingsChanged = async (standings) => {
        if (!standings) return;
        if (working) return;

        const tasks = standings.TaskInfo;
        const standingsData = standings.StandingsData; // vueStandings.filteredStandings;

        if (oldStandingsData === standingsData) return;
        oldStandingsData = standingsData;
        working = true;
        // console.log(standings);

        { // remove old contents
            const oldContents = document.getElementById("acssa-contents");
            if (oldContents) {
                // oldContents.parentNode.removeChild(oldContents);
                oldContents.remove();
            }
        }

        /** 問題ごとの最終 AC 時刻リスト．
         * @type {Map<number, number[]>} */
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
        const innerRatingsFromPredictor = await (async () => {
            try {
                const res = await fetch(`https://data.ac-predictor.com/aperfs/${contestScreenName}.json`);
                if (res.ok) return await res.json();
            } catch (e) {
                console.warn(e);
            }
            return {};
        })();

        /** 現在のユーザの各問題の AC 時刻．
         * @type {number[]} */
        const yourTaskAcceptedElapsedTimes = Array(tasks.length);
        yourTaskAcceptedElapsedTimes.fill(-1);
        /** 現在のユーザのスコア */
        let yourScore = -1;
        /** 現在のユーザの最終 AC 時刻 */
        let yourLastAcceptedTime = -1;

        // 順位表情報を走査する（内部レートのリストと正答時間リストを構築する）
        let participants = 0;
        for (let i = 0; i < standingsData.length; ++i) {
            const standingsEntry = standingsData[i];

            if (!standingsEntry.TaskResults) continue; // 参加登録していない
            if (standingsEntry.UserIsDeleted) continue; // アカウント削除
            let correctedRating = isDuringContest ? standingsEntry.Rating : standingsEntry.OldRating;
            const isTeamOrBeginner = (correctedRating === 0);
            if (isTeamOrBeginner) {
                // continue; // 初参加 or チーム
                correctedRating = centerOfInnerRating;
            }

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
            participants++;
            // console.log(i + 1, score, penalty);

            score /= 100;
            if (scoreLastAcceptedTimeMap.has(score)) {
                scoreLastAcceptedTimeMap.get(score).push(standingsEntry.TotalResult.Elapsed / NS2SEC)
            } else {
                scoreLastAcceptedTimeMap.set(score, [standingsEntry.TotalResult.Elapsed / NS2SEC]);
            }

            const innerRating = isTeamOrBeginner
                ? correctedRating
                : (standingsEntry.UserScreenName in innerRatingsFromPredictor)
                    ? innerRatingsFromPredictor[standingsEntry.UserScreenName]
                    : RatingConverter.toInnerRating(
                        Math.max(RatingConverter.toRealRating(correctedRating), 1), standingsEntry.Competitions);
            if (innerRating) innerRatings.push(innerRating);
            else {
                console.log(i, innerRating, correctedRating, standingsEntry.Competitions);
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
            if (standingsEntry.UserScreenName == userScreenName) {
                yourScore = score;
                yourLastAcceptedTime = standingsEntry.TotalResult.Elapsed / NS2SEC;
                for (let j = 0; j < tasks.length; ++j) {
                    const taskResultEntry = standingsEntry.TaskResults[tasks[j].TaskScreenName];
                    const isAccepted = (taskResultEntry?.Score > 0 && taskResultEntry?.Status == 1);
                    if (isAccepted) {
                        yourTaskAcceptedElapsedTimes[j] = taskResultEntry.Elapsed / NS2SEC;
                    }
                }
            }
        }
        innerRatings.sort((a, b) => a - b);

        const dc = new DifficultyCalculator(innerRatings);

        const plotlyDifficultyChartId = 'acssa-mydiv-difficulty';
        const plotlyAcceptedCountChartId = 'acssa-mydiv-accepted-count';
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
          <div id="acssa-tab-wrapper">
            <ul class="nav nav-pills small" id="acssa-chart-tab">
                <li class="active">
                <a class="acssa-chart-tab-button"><span class="glyphicon glyphicon-stats" aria-hidden="true"></span>Difficulty</a></li>
                <li>
                <a class="acssa-chart-tab-button"><span class="glyphicon glyphicon-stats" aria-hidden="true"></span>AC Count</a></li>
                <li>
                <a class="acssa-chart-tab-button"><span class="glyphicon glyphicon-stats" aria-hidden="true"></span>LastAcceptedTime</a></li>
            </ul>
            <ul class="nav nav-pills" id="acssa-checkbox-tab">
              <li>
                <a><label><input type="checkbox" id="acssa-checkbox-toggle-your-result-visibility" checked> Plot your result</label></a></li>
              <li id="acssa-checkbox-toggle-log-plot-parent">
                <a><label><input type="checkbox" id="acssa-checkbox-toggle-log-plot">Log plot</label></a></li>
            </ul>
          </div>
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
            <div class="acssa-chart-wrapper" id="${plotlyAcceptedCountChartId}-wrapper">
                <div id="${plotlyAcceptedCountChartId}" style="width:100%;"></div>
            </div>
            <div class="acssa-chart-wrapper" id="${plotlyLastAcceptedTimeChartId}-wrapper">
                <div id="${plotlyLastAcceptedTimeChartId}" style="width:100%;"></div>
            </div>
          </div>
        </div>
        `);

        // チェックボックス操作時のイベントを登録する
        /** @type {HTMLInputElement} */
        const checkbox = document.getElementById("acssa-checkbox-toggle-your-result-visibility");
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                document.querySelectorAll('.acssa-task-checked').forEach(elm => {
                    elm.style.display = 'inline';
                });
            } else {
                document.querySelectorAll('.acssa-task-checked').forEach(elm => {
                    elm.style.display = 'none';
                });
            }
        });

        let activeTab = 0;
        const showYourResult = [true, true, true];

        let yourDifficultyChartData = null;
        let yourAcceptedCountChartData = null;
        let yourLastAcceptedTimeChartData = null;
        let yourLastAcceptedTimeChartDataIndex = -1;
        const onCheckboxChanged = () => {
            showYourResult[activeTab] = checkbox.checked;
            if (checkbox.checked) {
                // show
                switch (activeTab) {
                    case 0:
                        if (yourScore > 0) Plotly.addTraces(plotlyDifficultyChartId, yourDifficultyChartData);
                        break;
                    case 1:
                        if (yourScore > 0) Plotly.addTraces(plotlyAcceptedCountChartId, yourAcceptedCountChartData);
                        break;
                    case 2:
                        if (yourLastAcceptedTimeChartDataIndex != -1) {
                            Plotly.addTraces(plotlyLastAcceptedTimeChartId, yourLastAcceptedTimeChartData, yourLastAcceptedTimeChartDataIndex);
                        }
                        break;
                    default:
                        break;
                }
            } else {
                // hide
                switch (activeTab) {
                    case 0:
                        if (yourScore > 0) Plotly.deleteTraces(plotlyDifficultyChartId, -1);
                        break;
                    case 1:
                        if (yourScore > 0) Plotly.deleteTraces(plotlyAcceptedCountChartId, -1);
                        break;
                    case 2:
                        if (yourLastAcceptedTimeChartDataIndex != -1) {
                            Plotly.deleteTraces(plotlyLastAcceptedTimeChartId, yourLastAcceptedTimeChartDataIndex);
                        }
                        break;
                    default:
                        break;
                }
            }
        };

        /** @type {HTMLInputElement} */
        const logPlotCheckbox = document.getElementById('acssa-checkbox-toggle-log-plot');
        const logPlotCheckboxParent = document.getElementById('acssa-checkbox-toggle-log-plot-parent');

        let acceptedCountYMax = -1;
        const useLogPlot = [false, false, false];
        const onLogPlotCheckboxChanged = () => {
            if (acceptedCountYMax == -1) return;
            useLogPlot[activeTab] = logPlotCheckbox.checked;
            if (activeTab == 1) {
                if (logPlotCheckbox.checked) {
                    // log plot
                    const layout = {
                        yaxis: {
                            type: 'log',
                            range: [
                                Math.log10(0.5),
                                Math.log10(acceptedCountYMax)
                            ],
                        },
                    };
                    Plotly.relayout(plotlyAcceptedCountChartId, layout);
                } else {
                    // linear plot
                    const layout = {
                        yaxis: {
                            type: 'linear',
                            range: [
                                0,
                                acceptedCountYMax
                            ],
                        },
                    };
                    Plotly.relayout(plotlyAcceptedCountChartId, layout);
                }
            } else if (activeTab == 2) {
                if (logPlotCheckbox.checked) {
                    // log plot
                    const layout = {
                        xaxis: {
                            type: 'log',
                            range: [
                                Math.log10(0.5),
                                Math.log10(participants)
                            ],
                        },
                    };
                    Plotly.relayout(plotlyLastAcceptedTimeChartId, layout);
                } else {
                    // linear plot
                    const layout = {
                        xaxis: {
                            type: 'linear',
                            range: [
                                0,
                                participants
                            ],
                        },
                    };
                    Plotly.relayout(plotlyLastAcceptedTimeChartId, layout);
                }
            }
        };

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
                        logPlotCheckboxParent.style.display = 'none';
                        break;
                    case 1:
                        Plotly.relayout(plotlyAcceptedCountChartId, { width: document.getElementById(plotlyAcceptedCountChartId).clientWidth });
                        logPlotCheckboxParent.style.display = 'block';
                        break;
                    case 2:
                        Plotly.relayout(plotlyLastAcceptedTimeChartId, { width: document.getElementById(plotlyLastAcceptedTimeChartId).clientWidth });
                        logPlotCheckboxParent.style.display = 'block';
                        break;
                    default:
                        break;
                }
                if (showYourResult[activeTab] !== checkbox.checked) {
                    onCheckboxChanged();
                }
                if (activeTab !== 0 && useLogPlot[activeTab] !== logPlotCheckbox.checked) {
                    onLogPlotCheckboxChanged();
                }
            });
        });

        logPlotCheckbox.addEventListener('change', onLogPlotCheckboxChanged);

        // 現在の Difficulty テーブルを構築する
        for (let j = 0; j < tasks.length; ++j) {
            const correctedDifficulty = RatingConverter.toCorrectedRating(dc.binarySearch(taskAcceptedCounts[j]));
            document.getElementById("acssa-thead").insertAdjacentHTML("beforeend", `
                <td>
                  ${tasks[j].Assignment}
                  ${yourTaskAcceptedElapsedTimes[j] === -1 ? '' : '<span class="acssa-task-checked">✓</span>'}
                </td>
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

        if (yourScore == -1) {
            // disable checkbox
            checkbox.checked = false;
            checkbox.disabled = true;
            checkbox.parentElement.style.cursor = 'default';
            checkbox.parentElement.style.textDecoration = 'line-through';
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
            /** Difficulty Chart のデータ
             * @type {{x: number, y: number, type: string, name: string}[]} */
            const difficultyChartData = [];
            /** AC Count Chart のデータ
             * @type {{x: number, y: number, type: string, name: string}[]} */
            const acceptedCountChartData = [];

            for (let j = 0; j < tasks.length; ++j) { // 
                const interval = Math.ceil(taskAcceptedCounts[j] / 140);
                /** @type {[number[], number[]]} */
                const [taskAcceptedElapsedTimesForChart, taskAcceptedCountsForChart] = taskAcceptedElapsedTimes[j].reduce(
                    ([ar, arr], tm, idx) => {
                        const tmpInterval = Math.max(1, Math.min(Math.ceil(idx / 10), interval));
                        if (idx % tmpInterval == 0 || idx == taskAcceptedCounts[j] - 1) {
                            ar.push(tm);
                            arr.push(idx + 1);
                        }
                        return [ar, arr];
                    },
                    [[], []]
                );

                difficultyChartData.push({
                    x: taskAcceptedElapsedTimesForChart,
                    y: taskAcceptedCountsForChart.map(taskAcceptedCountForChart => dc.binarySearch(taskAcceptedCountForChart)),
                    type: 'scatter',
                    name: `${tasks[j].Assignment}`,
                });
                acceptedCountChartData.push({
                    x: taskAcceptedElapsedTimesForChart,
                    y: taskAcceptedCountsForChart,
                    type: 'scatter',
                    name: `${tasks[j].Assignment}`,
                });
            }

            // 現在のユーザのデータを追加
            const yourMarker = {
                size: 10,
                symbol: "cross",
                color: 'red',
                line: {
                    color: 'white',
                    width: 1,
                },
            };
            if (yourScore !== -1) {
                /** @type {number[]} */
                const yourAcceptedTimes = [];
                /** @type {number[]} */
                const yourAcceptedDifficulties = [];
                /** @type {number[]} */
                const yourAcceptedCounts = [];

                for (let j = 0; j < tasks.length; ++j) {
                    if (yourTaskAcceptedElapsedTimes[j] !== -1) {
                        yourAcceptedTimes.push(yourTaskAcceptedElapsedTimes[j]);
                        const yourAcceptedCount = arrayLowerBound(taskAcceptedElapsedTimes[j], yourTaskAcceptedElapsedTimes[j]) + 1;
                        yourAcceptedCounts.push(yourAcceptedCount);
                        yourAcceptedDifficulties.push(dc.binarySearch(yourAcceptedCount));
                    }
                }

                yourDifficultyChartData = {
                    x: yourAcceptedTimes,
                    y: yourAcceptedDifficulties,
                    mode: 'markers',
                    type: 'scatter',
                    name: `${userScreenName}`,
                    marker: yourMarker,
                };
                yourAcceptedCountChartData = {
                    x: yourAcceptedTimes,
                    y: yourAcceptedCounts,
                    mode: 'markers',
                    type: 'scatter',
                    name: `${userScreenName}`,
                    marker: yourMarker,
                };
                difficultyChartData.push(yourDifficultyChartData);
                acceptedCountChartData.push(yourAcceptedCountChartData);
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

                if (score === yourScore) {
                    const lastAcceptedTimesRank = arrayLowerBound(lastAcceptedTimes, yourLastAcceptedTime);
                    yourLastAcceptedTimeChartData = {
                        x: [acc + lastAcceptedTimesRank + 1],
                        y: [yourLastAcceptedTime],
                        mode: 'markers',
                        type: 'scatter',
                        name: `${userScreenName}`,
                        marker: yourMarker,
                    };
                    yourLastAcceptedTimeChartDataIndex = lastAcceptedTimeChartData.length + 0;
                    lastAcceptedTimeChartData.push(yourLastAcceptedTimeChartData);
                }

                acc += lastAcceptedTimes.length;
                if (lastAcceptedTimes[lastAcceptedTimes.length - 1] > maxAcceptedTime) {
                    maxAcceptedTime = lastAcceptedTimes[lastAcceptedTimes.length - 1];
                }
            });

            const duration = getContestDurationSec();
            const xtick = (60 * 10) * Math.max(1, Math.ceil(duration / (60 * 10 * 20))); // 10 分を最小単位にする

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
                const layout = {
                    title: 'Difficulty',
                    xaxis: {
                        dtick: xtick,
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
                acceptedCountYMax = participants;
                /** @type {[number, number, string][]} */
                const rectSpans = colors.reduce((ar, cur) => {
                    const bottom = dc.perf2ExpectedAcceptedCount(cur[1]);
                    if (bottom > acceptedCountYMax) return ar;
                    const top = (cur[0] == 0) ? acceptedCountYMax : dc.perf2ExpectedAcceptedCount(cur[0]);
                    if (top < 0.5) return ar;
                    ar.push([Math.max(0.5, bottom), Math.min(acceptedCountYMax, top), cur[2]]);
                    return ar;
                }, []);
                // 描画
                const layout = {
                    title: 'Accepted Count',
                    xaxis: {
                        dtick: xtick,
                        tickformat: 'TIME',
                        range: [0, duration],
                        // title: { text: 'Elapsed' }
                    },
                    yaxis: {
                        // type: 'log',
                        // dtick: 100,
                        tickformat: 'd',
                        range: [
                            0,
                            acceptedCountYMax
                        ],
                        // range: [
                        //     Math.log10(0.5),
                        //     Math.log10(acceptedCountYMax)
                        // ],
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
                Plotly.newPlot(plotlyAcceptedCountChartId, acceptedCountChartData, layout, config);

                window.addEventListener('resize', () => {
                    if (activeTab == 1)
                        Plotly.relayout(plotlyAcceptedCountChartId, { width: document.getElementById(plotlyAcceptedCountChartId).clientWidth });
                });
            }

            // LastAcceptedTime Chart 描画
            {
                const xMax = participants;
                const yMax = Math.ceil((maxAcceptedTime + xtick / 2) / xtick) * xtick;
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
                        dtick: xtick,
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

            // 現在のユーザの結果表示・非表示 toggle
            checkbox.addEventListener('change', onCheckboxChanged);

            document.getElementById('acssa-loader').style.display = 'none';
            document.getElementById('acssa-tab-wrapper').style.display = 'block';
            working = false;
        }, 100); // end setTimeout()
    };

    // MAIN
    vueStandings.$watch('standings', onStandingsChanged, { deep: true, immediate: true });

})();
