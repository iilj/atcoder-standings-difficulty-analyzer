// これを書くのは駄目．
// import moment = require("moment");
// 参考：TypeScriptでd.ts内でimportすると外部でその型が読み込めなくなるのを解決した的なお話 ~ 適当な感じでプログラミングとか！
// http://watanabeyu.blogspot.com/2019/12/typescriptdtsimport.html

/** 言語設定，"ja" など． */
declare var LANG: string;
/** ユーザ名．"abb" など． */
declare var userScreenName: string;
/** CSRF トークン． */
declare var csrfToken: string;

/** コンテスト slug. "abc212" など． */
declare var contestScreenName: string;
/** 現在の設定言語における残り時間テキスト．"残り時間" など． */
declare var remainingText: string;
/** 現在の設定言語における開始時間テキスト．"開始まであと" など． */
declare var countDownText: string;
/** コンテスト開始時刻．moment("2021-07-31T21:00:00+09:00") など． */
declare var startTime: import("moment").Moment;
/** コンテスト終了時刻．moment("2021-07-31T22:40:00+09:00") など． */
declare var endTime: import("moment").Moment;

/** "/contests/abc212/standings/json" */
declare var standingsAPI: string;
/** { "Alex_2oo8": "#22AA99", "Benq": "#1E8449", "DEGwer": "#8C0AB4", ...} */
declare var userColor: { [key: string]: string };
/** [10, 20, 50, 100, 1000] */
declare var perPages: number[];
/** [{ "Name": "日本", "Code": "JP" }, { "Name": "アイスランド", "Code": "IS" },  ...] */
declare var countryList: { [key: string]: string }[];
/** true */
declare var viewSubmissions: boolean;
/** true */
declare var showFlag: boolean;
/** true */
declare var hiddenName: boolean;
/** null */
declare var watching: null;
/** "general" */
declare var standingsScreenName: string;
/** false */
declare var isMarathon: boolean;
/** null */
declare var isVirtual: null;
/** 3 * 1000 */
declare const REFRESH_BTN_COOL_DOWN: number;
/** [80 * 1000, 100 * 1000] */
declare const REFRESH_INTERVAL_RANGE: [number, number];

/** Vue.js で生成したオブジェクト，順位表の情報を持っている． */
declare var vueStandings: import("vue").default;
