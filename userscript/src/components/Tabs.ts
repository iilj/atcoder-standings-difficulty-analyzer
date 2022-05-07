import Plotly = require('plotly.js');
import html from './tabs.html';
import { plotlyAcceptedCountChartId, plotlyDifficultyChartId, plotlyLastAcceptedTimeChartId } from './Charts';

const TABS_WRAPPER_ID = 'acssa-tab-wrapper' as const;
const CHART_TAB_ID = 'acssa-chart-tab' as const;
const CHART_TAB_BUTTON_CLASS = 'acssa-chart-tab-button' as const;
const CHECKBOX_TOGGLE_YOUR_RESULT_VISIBILITY = 'acssa-checkbox-toggle-your-result-visibility' as const;
const PARENT_CHECKBOX_TOGGLE_YOUR_RESULT_VISIBILITY = `${CHECKBOX_TOGGLE_YOUR_RESULT_VISIBILITY}-parent` as const;
const CHECKBOX_TOGGLE_LOG_PLOT = 'acssa-checkbox-toggle-log-plot' as const;
const CHECKBOX_TOGGLE_ONLOAD_PLOT = 'acssa-checkbox-toggle-onload-plot' as const;
const CONFIG_CNLOAD_PLOT_KEY = 'acssa-config-onload-plot' as const;
const PARENT_CHECKBOX_TOGGLE_LOG_PLOT = `${CHECKBOX_TOGGLE_LOG_PLOT}-parent` as const;

export class Tabs {
    activeTab: number;
    showYourResult: [boolean, boolean, boolean];
    useLogPlot: [boolean, boolean, boolean];

    showYourResultCheckbox: HTMLInputElement;
    logPlotCheckbox: HTMLInputElement;
    logPlotCheckboxParent: HTMLLIElement;
    onloadPlotCheckbox: HTMLInputElement;

    acceptedCountYMax: number;
    yourDifficultyChartData: Partial<Plotly.PlotData> | null;
    yourAcceptedCountChartData: Partial<Plotly.PlotData> | null;
    yourLastAcceptedTimeChartData: Partial<Plotly.PlotData> | null;
    yourLastAcceptedTimeChartDataIndex: number;

    yourScore: number;
    participants: number;

    onloadPlot: boolean;

    constructor(parent: HTMLDivElement, yourScore: number, participants: number) {
        this.yourScore = yourScore;
        this.participants = participants;

        // insert
        parent.insertAdjacentHTML('beforeend', html);

        this.showYourResultCheckbox = document.getElementById(
            CHECKBOX_TOGGLE_YOUR_RESULT_VISIBILITY
        ) as HTMLInputElement;
        this.logPlotCheckbox = document.getElementById(CHECKBOX_TOGGLE_LOG_PLOT) as HTMLInputElement;
        this.logPlotCheckboxParent = document.getElementById(PARENT_CHECKBOX_TOGGLE_LOG_PLOT) as HTMLLIElement;
        this.onloadPlotCheckbox = document.getElementById(CHECKBOX_TOGGLE_ONLOAD_PLOT) as HTMLInputElement;
        this.onloadPlot = JSON.parse(localStorage.getItem(CONFIG_CNLOAD_PLOT_KEY) ?? 'true') as boolean;
        this.onloadPlotCheckbox.checked = this.onloadPlot;

        // チェックボックス操作時のイベントを登録する */
        this.showYourResultCheckbox.addEventListener('change', () => {
            if (this.showYourResultCheckbox.checked) {
                document.querySelectorAll('.acssa-task-success.acssa-task-success-suppress').forEach((elm) => {
                    elm.classList.remove('acssa-task-success-suppress');
                });
            } else {
                document.querySelectorAll('.acssa-task-success').forEach((elm) => {
                    elm.classList.add('acssa-task-success-suppress');
                });
            }
        });
        this.showYourResultCheckbox.addEventListener('change', (): void => {
            void this.onShowYourResultCheckboxChangedAsync();
        });
        this.logPlotCheckbox.addEventListener('change', (): void => {
            void this.onLogPlotCheckboxChangedAsync();
        });
        this.onloadPlotCheckbox.addEventListener('change', (): void => {
            this.onloadPlot = this.onloadPlotCheckbox.checked;
            localStorage.setItem(CONFIG_CNLOAD_PLOT_KEY, JSON.stringify(this.onloadPlot));
        });

        this.activeTab = 0;
        this.showYourResult = [true, true, true];
        this.acceptedCountYMax = -1;
        this.useLogPlot = [false, false, false];

        this.yourDifficultyChartData = null;
        this.yourAcceptedCountChartData = null;
        this.yourLastAcceptedTimeChartData = null;
        this.yourLastAcceptedTimeChartDataIndex = -1;

        document
            .querySelectorAll<HTMLAnchorElement>(`.${CHART_TAB_BUTTON_CLASS}`)
            .forEach((btn: HTMLAnchorElement, key: number) => {
                btn.addEventListener('click', () => void this.onTabButtonClicked(btn, key));
            });

        if (this.yourScore == -1) {
            // disable checkbox
            this.showYourResultCheckbox.checked = false;
            this.showYourResultCheckbox.disabled = true;
            const checkboxParent = this.showYourResultCheckbox.parentElement as HTMLElement;
            checkboxParent.style.cursor = 'default';
            checkboxParent.style.textDecoration = 'line-through';
        }
    }

    async onShowYourResultCheckboxChangedAsync(): Promise<void> {
        this.showYourResult[this.activeTab] = this.showYourResultCheckbox.checked;
        if (this.showYourResultCheckbox.checked) {
            // show
            switch (this.activeTab) {
                case 0:
                    if (this.yourScore > 0 && this.yourDifficultyChartData !== null)
                        await Plotly.addTraces(plotlyDifficultyChartId, this.yourDifficultyChartData);
                    break;
                case 1:
                    if (this.yourScore > 0 && this.yourAcceptedCountChartData !== null)
                        await Plotly.addTraces(plotlyAcceptedCountChartId, this.yourAcceptedCountChartData);
                    break;
                case 2:
                    if (this.yourLastAcceptedTimeChartData !== null && this.yourLastAcceptedTimeChartDataIndex != -1) {
                        await Plotly.addTraces(
                            plotlyLastAcceptedTimeChartId,
                            this.yourLastAcceptedTimeChartData,
                            this.yourLastAcceptedTimeChartDataIndex
                        );
                    }
                    break;
                default:
                    break;
            }
        } else {
            // hide
            switch (this.activeTab) {
                case 0:
                    if (this.yourScore > 0) await Plotly.deleteTraces(plotlyDifficultyChartId, -1);
                    break;
                case 1:
                    if (this.yourScore > 0) await Plotly.deleteTraces(plotlyAcceptedCountChartId, -1);
                    break;
                case 2:
                    if (this.yourLastAcceptedTimeChartDataIndex != -1) {
                        await Plotly.deleteTraces(
                            plotlyLastAcceptedTimeChartId,
                            this.yourLastAcceptedTimeChartDataIndex
                        );
                    }
                    break;
                default:
                    break;
            }
        }
    } // end async onShowYourResultCheckboxChangedAsync()

    async onLogPlotCheckboxChangedAsync(): Promise<void> {
        if (this.acceptedCountYMax == -1) return;
        this.useLogPlot[this.activeTab] = this.logPlotCheckbox.checked;
        if (this.activeTab == 1) {
            if (this.logPlotCheckbox.checked) {
                // log plot
                const layout: Partial<Plotly.Layout> = {
                    yaxis: {
                        type: 'log',
                        range: [Math.log10(0.5), Math.log10(this.acceptedCountYMax)],
                    },
                };
                await Plotly.relayout(plotlyAcceptedCountChartId, layout);
            } else {
                // linear plot
                const layout: Partial<Plotly.Layout> = {
                    yaxis: {
                        type: 'linear',
                        range: [0, this.acceptedCountYMax],
                    },
                };
                await Plotly.relayout(plotlyAcceptedCountChartId, layout);
            }
        } else if (this.activeTab == 2) {
            if (this.logPlotCheckbox.checked) {
                // log plot
                const layout: Partial<Plotly.Layout> = {
                    xaxis: {
                        type: 'log',
                        range: [Math.log10(0.5), Math.log10(this.participants)],
                    },
                };
                await Plotly.relayout(plotlyLastAcceptedTimeChartId, layout);
            } else {
                // linear plot
                const layout: Partial<Plotly.Layout> = {
                    xaxis: {
                        type: 'linear',
                        range: [0, this.participants],
                    },
                };
                await Plotly.relayout(plotlyLastAcceptedTimeChartId, layout);
            }
        }
    } // end async onLogPlotCheckboxChangedAsync

    async onTabButtonClicked(btn: HTMLAnchorElement, key: number): Promise<void> {
        // check whether active or not
        const buttonParent = btn.parentElement as HTMLElement;
        if (buttonParent.className == 'active') return;
        // modify visibility
        this.activeTab = key;
        (document.querySelector<HTMLLIElement>(`#${CHART_TAB_ID} li.active`) as HTMLLIElement).classList.remove(
            'active'
        );
        (
            document.querySelector<HTMLLIElement>(`#${CHART_TAB_ID} li:nth-child(${key + 1})`) as HTMLLIElement
        ).classList.add('active');
        (
            document.querySelector<HTMLDivElement>(
                '#acssa-chart-block div.acssa-chart-wrapper-active'
            ) as HTMLDivElement
        ).classList.remove('acssa-chart-wrapper-active');
        (
            document.querySelector(`#acssa-chart-block div.acssa-chart-wrapper:nth-child(${key + 1})`) as HTMLDivElement
        ).classList.add('acssa-chart-wrapper-active');
        // resize charts
        switch (key) {
            case 0:
                await Plotly.relayout(plotlyDifficultyChartId, {
                    width: (document.getElementById(plotlyDifficultyChartId) as HTMLElement).clientWidth,
                });
                this.logPlotCheckboxParent.style.display = 'none';
                break;
            case 1:
                await Plotly.relayout(plotlyAcceptedCountChartId, {
                    width: (document.getElementById(plotlyAcceptedCountChartId) as HTMLElement).clientWidth,
                });
                this.logPlotCheckboxParent.style.display = 'block';
                break;
            case 2:
                await Plotly.relayout(plotlyLastAcceptedTimeChartId, {
                    width: (document.getElementById(plotlyLastAcceptedTimeChartId) as HTMLElement).clientWidth,
                });
                this.logPlotCheckboxParent.style.display = 'block';
                break;
            default:
                break;
        }
        if (this.showYourResult[this.activeTab] !== this.showYourResultCheckbox.checked) {
            await this.onShowYourResultCheckboxChangedAsync();
        }
        if (this.activeTab !== 0 && this.useLogPlot[this.activeTab] !== this.logPlotCheckbox.checked) {
            await this.onLogPlotCheckboxChangedAsync();
        }
    }

    showTabsControl(): void {
        (document.getElementById(TABS_WRAPPER_ID) as HTMLElement).style.display = 'block';
        if (!this.onloadPlot) {
            (document.getElementById(CHART_TAB_ID) as HTMLUListElement).style.display = 'none';
            (document.getElementById(PARENT_CHECKBOX_TOGGLE_YOUR_RESULT_VISIBILITY) as HTMLLIElement).style.display =
                'none';
        }
    }
}
