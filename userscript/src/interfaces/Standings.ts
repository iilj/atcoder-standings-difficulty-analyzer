import Vue from 'vue';

export type Rating = number;
export type Score = number;
export type ElapsedSeconds = number;

interface ResultEntry {
    /** 謎 */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly Additional: any;
    /** 提出回数 */
    readonly Count: number;
    /** コンテスト開始からの経過時間 [ns]. */
    readonly Elapsed: number;
    /** アカウントが凍結済みかどうか？ */
    readonly Frozen: boolean;
    /** ペナルティ数 */
    readonly Penalty: number;
    /** 得点（×100） */
    readonly Score: number;
}

/** 問題ごとの結果エントリ */
export interface TaskResultEntry extends ResultEntry {
    /** 非 AC の提出数（ACするまではペナルティではない）． */
    readonly Failure: number;
    /** ジャッジ中かどうか？ */
    readonly Pending: boolean;
    /** 1 のとき満点？ 6 のとき部分点？ */
    readonly Status: number;
}

/** 全問題の結果 */
export interface TotalResultEntry extends ResultEntry {
    /** 正解した問題数 */
    readonly Accepted: number;
}

/** 順位表エントリ */
export interface StandingsEntry {
    /** 謎 */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly Additional: any;
    /** 所属．IsTeam = true のときは，チームメンバを「, 」で結合した文字列． */
    readonly Affiliation: string;
    /** AtCoder 内順位 */
    readonly AtCoderRank: number;
    /** Rated コンテスト参加回数 */
    readonly Competitions: number;
    /** 国ラベル．"JP" など． */
    readonly Country: string;
    /** 表示名．"hitonanode" など． */
    readonly DisplayName: string;
    /** コンテスト順位？ */
    readonly EntireRank: number;
    /** Rated かどうか */
    readonly IsRated: boolean;
    /** チームかどうか */
    readonly IsTeam: boolean;
    /** コンテスト前のレーティング．コンテスト後のみ有効． */
    readonly OldRating: Rating;
    /** コンテスト順位？ */
    readonly Rank: number;
    /** コンテスト後のレーティング */
    readonly Rating: Rating;
    /** 問題ごとの結果．参加登録していない人は空． */
    readonly TaskResults: { [key: string]: TaskResultEntry };
    /** 全体の結果 */
    readonly TotalResult: TotalResultEntry;
    /** ユーザアカウントが削除済みかどうか */
    readonly UserIsDeleted: boolean;
    /** ユーザ名．"hitonanode" など． */
    readonly UserName: string;
    /** ユーザの表示名．"hitonanode" など． */
    readonly UserScreenName: string;
}

/** 問題エントリ */
export interface TaskInfoEntry {
    /** 問題ラベル．"A" など． */
    readonly Assignment: string;
    /** 問題名． */
    readonly TaskName: string;
    /** 問題の slug. "abc185_a" など． */
    readonly TaskScreenName: string;
}

/** 順位表情報 */
export interface Standings {
    /** 謎 */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly AdditionalColumns: any;
    /** 謎 */
    readonly Fixed: boolean;
    /** 順位表データ */
    readonly StandingsData: StandingsEntry[];
    /** 問題データ */
    readonly TaskInfo: TaskInfoEntry[];
}

export type VueStandings = Standings & Vue;
