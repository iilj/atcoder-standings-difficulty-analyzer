import { Rating } from '../interfaces/Standings';
import { getColor } from '../utils';

/** レートを表す難易度円(◒)の HTML 文字列を生成 */
export const generateDifficultyCircle = (rating: Rating, isSmall = true): string => {
    const size = isSmall ? 12 : 36;
    const borderWidth = isSmall ? 1 : 3;

    const style =
        `display:inline-block;border-radius:50%;border-style:solid;border-width:${borderWidth}px;` +
        `margin-right:5px;vertical-align:initial;height:${size}px;width:${size}px;`;

    if (rating < 3200) {
        // 色と円がどのぐらい満ちているかを計算
        const color = getColor(rating);
        const percentFull = ((rating % 400) / 400) * 100;

        // ◒を生成
        return (
            `
                <span style='${style}border-color:${color};background:` +
            `linear-gradient(to top, ${color} 0%, ${color} ${percentFull}%, ` +
            `rgba(0, 0, 0, 0) ${percentFull}%, rgba(0, 0, 0, 0) 100%); '>
                </span>`
        );
    }
    // 金銀銅は例外処理
    else if (rating < 3600) {
        return (
            `<span style="${style}border-color: rgb(150, 92, 44);` +
            'background: linear-gradient(to right, rgb(150, 92, 44), rgb(255, 218, 189), rgb(150, 92, 44));"></span>'
        );
    } else if (rating < 4000) {
        return (
            `<span style="${style}border-color: rgb(128, 128, 128);` +
            'background: linear-gradient(to right, rgb(128, 128, 128), white, rgb(128, 128, 128));"></span>'
        );
    } else {
        return (
            `<span style="${style}border-color: rgb(255, 215, 0);` +
            'background: linear-gradient(to right, rgb(255, 215, 0), white, rgb(255, 215, 0));"></span>'
        );
    }
};
