import { TaskInfoEntry } from '../interfaces/Standings';
import { getColor, rangeLen } from '../utils';
import { DifficultyCalculator } from '../utils/DifficultyCalculator';
import { generateDifficultyCircle } from './DifficultyCircle';

const COL_PER_ROW = 20;

export class DifficyltyTable {
    constructor(
        parent: HTMLDivElement,
        tasks: TaskInfoEntry[],
        isEstimationEnabled: boolean,
        dc: DifficultyCalculator,
        taskAcceptedCounts: number[],
        yourTaskAcceptedElapsedTimes: number[],
        acCountPredicted: number[]
    ) {
        // insert
        parent.insertAdjacentHTML(
            'beforeend',
            `
            <p><span class="h2">Difficulty</span></p>
            <div id="acssa-table-wrapper">
                ${rangeLen(Math.ceil(tasks.length / COL_PER_ROW))
                    .map(
                        (tableIdx) => `
                    <table id="acssa-table-${tableIdx}" class="table table-bordered table-hover th-center td-center td-middle acssa-table">
                        <tbody>
                        <tr id="acssa-thead-${tableIdx}" class="acssa-thead"></tr>
                        </tbody>
                        <tbody>
                        <tr id="acssa-tbody-${tableIdx}" class="acssa-tbody"></tr>
                        ${
                            isEstimationEnabled
                                ? `<tr id="acssa-tbody-predicted-${tableIdx}" class="acssa-tbody"></tr>`
                                : ''
                        }
                        </tbody>
                    </table>
                `
                    )
                    .join('')}
            </div>
        `
        );
        if (isEstimationEnabled) {
            for (let tableIdx = 0; tableIdx < Math.ceil(tasks.length / COL_PER_ROW); ++tableIdx) {
                (document.getElementById(`acssa-thead-${tableIdx}`) as HTMLElement).insertAdjacentHTML(
                    'beforeend',
                    `<th></th>`
                );
                (document.getElementById(`acssa-tbody-${tableIdx}`) as HTMLElement).insertAdjacentHTML(
                    'beforeend',
                    `<th>Current</td>`
                );
                (document.getElementById(`acssa-tbody-predicted-${tableIdx}`) as HTMLElement).insertAdjacentHTML(
                    'beforeend',
                    `<th>Predicted</td>`
                );
            }
        }

        // build
        for (let j = 0; j < tasks.length; ++j) {
            const tableIdx = Math.floor(j / COL_PER_ROW);
            const correctedDifficulty = dc.binarySearchCorrectedDifficulty(taskAcceptedCounts[j]);
            const tdClass = yourTaskAcceptedElapsedTimes[j] === -1 ? '' : 'class="success acssa-task-success"';
            (document.getElementById(`acssa-thead-${tableIdx}`) as HTMLElement).insertAdjacentHTML(
                'beforeend',
                `
                <td ${tdClass}>
                  ${tasks[j].Assignment}
                </td>
            `
            );
            const id = `td-assa-difficulty-${j}`;
            (document.getElementById(`acssa-tbody-${tableIdx}`) as HTMLElement).insertAdjacentHTML(
                'beforeend',
                `
                <td ${tdClass} id="${id}" style="color:${getColor(correctedDifficulty)};">
                ${correctedDifficulty === 9999 ? '-' : correctedDifficulty}</td>
            `
            );
            if (correctedDifficulty !== 9999) {
                (document.getElementById(id) as HTMLElement).insertAdjacentHTML(
                    'afterbegin',
                    generateDifficultyCircle(correctedDifficulty)
                );
            }
            if (isEstimationEnabled) {
                const correctedPredictedDifficulty = dc.binarySearchCorrectedDifficulty(acCountPredicted[j]);
                const idPredicted = `td-assa-difficulty-predicted-${j}`;
                (document.getElementById(`acssa-tbody-predicted-${tableIdx}`) as HTMLElement).insertAdjacentHTML(
                    'beforeend',
                    `
                    <td ${tdClass} id="${idPredicted}" style="color:${getColor(correctedPredictedDifficulty)};">
                    ${correctedPredictedDifficulty === 9999 ? '-' : correctedPredictedDifficulty}</td>
                `
                );
                if (correctedPredictedDifficulty !== 9999) {
                    (document.getElementById(idPredicted) as HTMLElement).insertAdjacentHTML(
                        'afterbegin',
                        generateDifficultyCircle(correctedPredictedDifficulty)
                    );
                }
            }
        }
    }
}
