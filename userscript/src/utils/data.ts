const BASE_URL =
    'https://raw.githubusercontent.com/iilj/atcoder-standings-difficulty-analyzer/main/json/standings' as const;

const fetchJson = async <T>(url: string): Promise<T> => {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(res.statusText);
    }
    const obj = (await res.json()) as T;
    return obj;
};

export type ContestAcRatioModel = { [key: string]: number[] } | undefined;

export const fetchContestAcRatioModel = async (
    contestScreenName: string,
    contestDurationMinutes: number
): Promise<ContestAcRatioModel> => {
    // https://raw.githubusercontent.com/iilj/atcoder-standings-difficulty-analyzer/main/json/standings/abc_100m.json
    let modelLocation: string | undefined = undefined;

    if (/^agc(\d{3,})$/.exec(contestScreenName)) {
        if ([110, 120, 130, 140, 150, 160, 180, 200, 210, 240, 270, 300].includes(contestDurationMinutes)) {
            modelLocation = `${BASE_URL}/agc_${contestDurationMinutes}m.json`;
        }
    } else if (/^arc(\d{3,})$/.exec(contestScreenName)) {
        if ([100, 120, 150].includes(contestDurationMinutes)) {
            modelLocation = `${BASE_URL}/arc_${contestDurationMinutes}m.json`;
        }
    } else if (/^abc(\d{3,})$/.exec(contestScreenName)) {
        if ([100, 120].includes(contestDurationMinutes)) {
            modelLocation = `${BASE_URL}/abc_${contestDurationMinutes}m.json`;
        }
    }
    if (modelLocation !== undefined) {
        return await fetchJson<ContestAcRatioModel>(modelLocation);
    }
    return undefined;
};

export type InnerRatingsFromPredictor = { [key: string]: number };

export const fetchInnerRatingsFromPredictor = async (contestScreenName: string): Promise<InnerRatingsFromPredictor> => {
    const url = `https://data.ac-predictor.com/aperfs/${contestScreenName}.json`;
    try {
        return await fetchJson<InnerRatingsFromPredictor>(url);
    } catch (e) {
        return {};
    }
};
