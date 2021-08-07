import { RatingConverter } from './RatingConverter';

export type Performance = number;
export type Difficulty = number;

export class DifficultyCalculator {
    innerRatings: number[];
    prepared: Map<number, number>;
    memo: Map<number, number>;

    constructor(sortedInnerRatings: number[]) {
        this.innerRatings = sortedInnerRatings;
        this.prepared = new Map<number, number>();
        this.memo = new Map<number, number>();
    }

    perf2ExpectedAcceptedCount(m: Performance): number {
        let expectedAcceptedCount: number;
        if (this.prepared.has(m)) {
            expectedAcceptedCount = this.prepared.get(m) as number;
        } else {
            expectedAcceptedCount = this.innerRatings.reduce(
                (prev_expected_accepts, innerRating) =>
                    (prev_expected_accepts += 1 / (1 + Math.pow(6, (m - innerRating) / 400))),
                0
            );
            this.prepared.set(m, expectedAcceptedCount);
        }
        return expectedAcceptedCount;
    }

    perf2Ranking(x: Performance): number {
        return this.perf2ExpectedAcceptedCount(x) + 0.5;
    }

    /** Difficulty 推定値を算出する */
    binarySearch(acceptedCount: number): Difficulty {
        if (this.memo.has(acceptedCount)) {
            return this.memo.get(acceptedCount) as Difficulty;
        }
        let lb = -10000;
        let ub = 10000;
        while (ub - lb > 1) {
            const m = Math.floor((ub + lb) / 2);
            const expectedAcceptedCount = this.perf2ExpectedAcceptedCount(m);

            if (expectedAcceptedCount < acceptedCount) ub = m;
            else lb = m;
        }
        const difficulty = lb;
        const correctedDifficulty = RatingConverter.toCorrectedRating(difficulty);
        this.memo.set(acceptedCount, correctedDifficulty);
        return correctedDifficulty;
    }
}
