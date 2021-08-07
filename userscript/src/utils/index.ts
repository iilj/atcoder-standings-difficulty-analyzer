import { Rating } from '../interfaces/Standings';

export const arrayLowerBound = (arr: number[], n: number): number => {
    let first = 0,
        last: number = arr.length - 1,
        middle: number;
    while (first <= last) {
        middle = 0 | ((first + last) / 2);
        if (arr[middle] < n) first = middle + 1;
        else last = middle - 1;
    }
    return first;
};

export const getColor = (rating: Rating): string => {
    if (rating < 400) return '#808080';
    //          gray
    else if (rating < 800) return '#804000';
    //     brown
    else if (rating < 1200) return '#008000';
    //    green
    else if (rating < 1600) return '#00C0C0';
    //    cyan
    else if (rating < 2000) return '#0000FF';
    //    blue
    else if (rating < 2400) return '#C0C000';
    //    yellow
    else if (rating < 2800) return '#FF8000';
    //    orange
    else if (rating == 9999) return '#000000';
    return '#FF0000'; //                            red
};

export const formatTimespan = (sec: number): string => {
    let sign: string;
    if (sec >= 0) {
        sign = '';
    } else {
        sign = '-';
        sec *= -1;
    }
    return `${sign}${Math.floor(sec / 60)}:${`0${sec % 60}`.slice(-2)}`;
};

/** 現在のページから，コンテストの開始から終了までの秒数を抽出する */
export const getContestDurationSec = (): number => {
    if (contestScreenName.startsWith('past')) {
        return 300 * 60;
    }
    // toDate.diff(fromDate) でミリ秒が返ってくる
    return endTime.diff(startTime) / 1000;
};

export const getCenterOfInnerRating = (contestScreenName: string): number => {
    if (contestScreenName.startsWith('agc')) {
        const contestNumber = Number(contestScreenName.substring(3, 6));
        return contestNumber >= 34 ? 1200 : 1600;
    }
    if (contestScreenName.startsWith('arc')) {
        const contestNumber = Number(contestScreenName.substring(3, 6));
        return contestNumber >= 104 ? 1000 : 1600;
    }
    return 800;
};

/**
 * returns array [start, start+1, ..., end].
 *
 * @param {number} start start number
 * @param {number} end end number
 * @returns {number[]} array
 */
export const range = (start: number, end: number): number[] =>
    Array.from({ length: end - start + 1 }, (v, k) => k + start);

export const rangeLen = (len: number): number[] => Array.from({ length: len }, (v, k) => k);
