export class RatingConverter {
    /** 表示用の低レート帯補正レート → 低レート帯補正前のレート */
    static toRealRating = (correctedRating: number): number => {
        if (correctedRating >= 400) return correctedRating;
        else return 400 * (1 - Math.log(400 / correctedRating));
    };

    /** 低レート帯補正前のレート → 内部レート推定値 */
    static toInnerRating = (realRating: number, comp: number): number => {
        return (
            realRating +
            (1200 * (Math.sqrt(1 - Math.pow(0.81, comp)) / (1 - Math.pow(0.9, comp)) - 1)) / (Math.sqrt(19) - 1)
        );
    };

    /** 低レート帯補正前のレート → 表示用の低レート帯補正レート */
    static toCorrectedRating = (realRating: number): number => {
        if (realRating >= 400) return realRating;
        else return Math.floor(400 / Math.exp((400 - realRating) / 400));
    };
}
