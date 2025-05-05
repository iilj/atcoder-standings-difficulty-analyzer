import { Parent } from './components/Parent';
import { VueStandings } from './interfaces/Standings';

{
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/plotly.js/1.33.1/plotly.min.js';
    script.async = true;
    script.onload = async () => {
        const parent = await Parent.init();
        vueStandings.$watch(
            'standings',
            (standings: VueStandings) => {
                void parent.onStandingsChanged(standings);
            },
            { deep: true, immediate: true }
        );
    };
    script.onerror = () => {
        console.error('plotly load failed');
    };
    document.head.appendChild(script);
}
