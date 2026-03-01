import type { WeatherData } from "./types";

const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: "Klar himmel",
  1: "Mestadels klart",
  2: "Delvis molnigt",
  3: "Mulet",
  45: "Dimma",
  48: "Rimfrost",
  51: "Lätt duggregn",
  53: "Duggregn",
  55: "Tätt duggregn",
  61: "Lätt regn",
  63: "Regn",
  65: "Kraftigt regn",
  71: "Lätt snöfall",
  73: "Snöfall",
  75: "Kraftigt snöfall",
  77: "Snögranulat",
  80: "Lätta regnskurar",
  81: "Regnskurar",
  82: "Kraftiga regnskurar",
  85: "Lätta snöbyar",
  86: "Snöbyar",
  95: "Åska",
  96: "Åska med hagel",
  99: "Kraftig åska med hagel",
};

export async function getWeather(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
    
    const res = await fetch(url, {
      next: { revalidate: 1800 },
    });

    if (!res.ok) {
      console.error("Weather API error:", res.status);
      return null;
    }

    const data = await res.json();
    const current = data.current_weather;

    return {
      temperature: Math.round(current.temperature),
      weatherCode: current.weathercode,
      weatherDescription: WEATHER_DESCRIPTIONS[current.weathercode] || "Okänt väder",
    };
  } catch (error) {
    console.error("Failed to fetch weather:", error);
    return null;
  }
}
