import { Parent } from './components/Parent';
import { VueStandings } from './interfaces/Standings';

void (async () => {
    const parent = await Parent.init();

    vueStandings.$watch(
        'standings',
        (standings: VueStandings) => {
            void parent.onStandingsChanged(standings);
        },
        { deep: true, immediate: true }
    );
})();
