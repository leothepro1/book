"use client";

import { useEffect, useState } from "react";
import type { WeatherData } from "../_lib/weather";

type Props = {
  latitude: number;
  longitude: number;
  mutedOpacity: number;
};

export default function WeatherWidget({ latitude, longitude, mutedOpacity }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWeather() {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`;
        const res = await fetch(url);
        
        if (!res.ok) {
          throw new Error("Weather API error");
        }

        const data = await res.json();
        const current = data.current_weather;

        function getWeatherDescription(code: number): string {
          if (code === 0 || code === 1) return "clear";
          if (code === 2 || code === 3) return "cloudy";
          if (code === 45 || code === 48) return "fog";
          if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
          if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
          if ([95, 96, 99].includes(code)) return "thunder";
          return "unknown";
        }

        setWeather({
          temperature: Math.round(current.temperature),
          weatherCode: current.weathercode,
          weatherDescription: getWeatherDescription(current.weathercode),
        });
      } catch (error) {
        console.error("Failed to fetch weather:", error);
        setWeather(null);
      } finally {
        setLoading(false);
      }
    }

    fetchWeather();
  }, [latitude, longitude]);

  const weatherIcons: Record<string, React.ReactNode> = {
    clear: (
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 96 96" fill="currentColor">
        <path d="M62.142 35.858a2 2 0 0 0 1.414-.586l2.829-2.829a2 2 0 1 0-2.828-2.828l-2.829 2.829a2 2 0 0 0 1.414 3.414M30 48a2 2 0 0 0-2-2h-4a2 2 0 0 0 0 4h4a2 2 0 0 0 2-2m2.444 12.728-2.829 2.829a2 2 0 1 0 2.828 2.828l2.829-2.829a2 2 0 1 0-2.828-2.828m0-25.456c.39.391.902.586 1.414.586s1.024-.195 1.414-.586a2 2 0 0 0 0-2.828l-2.829-2.829a2 2 0 1 0-2.828 2.828zM48 30a2 2 0 0 0 2-2v-4a2 2 0 0 0-4 0v4a2 2 0 0 0 2 2m24 16h-4a2 2 0 0 0 0 4h4a2 2 0 0 0 0-4m-8.444 14.728a2 2 0 1 0-2.828 2.828l2.829 2.829c.39.391.902.586 1.414.586s1.023-.195 1.414-.586a2 2 0 0 0 0-2.828zM48 66a2 2 0 0 0-2 2v4a2 2 0 0 0 4 0v-4a2 2 0 0 0-2-2m0-32c-7.72 0-14 6.28-14 14s6.28 14 14 14 14-6.28 14-14-6.28-14-14-14m0 24c-5.514 0-10-4.486-10-10s4.486-10 10-10 10 4.486 10 10-4.486 10-10 10"/>
      </svg>
    ),
    cloudy: (
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 96 96" fill="currentColor">
        <path d="M66 40c-.507 0-1.112.079-1.688.184C62.218 33.012 55.663 28 48 28s-14.218 5.012-16.312 12.184C31.112 40.079 30.507 40 30 40c-6.065 0-11 4.935-11 11s4.935 11 11 11h36c6.065 0 11-4.935 11-11s-4.935-11-11-11m0 18H30c-3.86 0-7-3.141-7-7s3.14-7 7-7c.277 0 .723.068 1.194.162V46a2 2 0 0 0 4 0v-3.226C36.27 36.524 41.632 32 48 32a12.94 12.94 0 0 1 12.808 10.784V46a2 2 0 0 0 4 0v-1.837c.47-.094.918-.163 1.192-.163 3.859 0 7 3.141 7 7s-3.141 7-7 7"/>
      </svg>
    ),
    rain: (
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 96 96" fill="currentColor">
        <path d="M48 78a2 2 0 0 0-2 2v4a2 2 0 0 0 4 0v-4a2 2 0 0 0-2-2m-9-6a2 2 0 0 0-2 2v4a2 2 0 0 0 4 0v-4a2 2 0 0 0-2-2m18 0a2 2 0 0 0-2 2v4a2 2 0 0 0 4 0v-4a2 2 0 0 0-2-2m9-32c-.508 0-1.112.079-1.689.184C62.218 33.012 55.663 28 48 28s-14.219 5.012-16.312 12.184C31.112 40.079 30.507 40 30 40c-6.065 0-11 4.935-11 11s4.935 11 11 11h7v4a2 2 0 0 0 4 0v-4h14v4a2 2 0 0 0 4 0v-4h7c6.065 0 11-4.935 11-11s-4.935-11-11-11m0 18H30c-3.859 0-7-3.141-7-7s3.141-7 7-7c.277 0 .723.068 1.193.162V46a2 2 0 0 0 4 0v-3.219C36.266 36.528 41.629 32 48 32c6.37 0 11.733 4.528 12.807 10.782V46a2 2 0 0 0 4 0v-1.837c.47-.094.919-.163 1.193-.163 3.859 0 7 3.141 7 7s-3.141 7-7 7m-18 8a2 2 0 0 0-2 2v4a2 2 0 0 0 4 0v-4a2 2 0 0 0-2-2"/>
      </svg>
    ),
    fog: (
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 96 96" fill="currentColor">
        <path d="M66 40c-.507 0-1.112.079-1.688.184C62.217 33.012 55.663 28 48 28s-14.218 5.012-16.311 12.184C31.112 40.079 30.507 40 30 40c-6.065 0-11 4.935-11 11s4.935 11 11 11a2 2 0 0 0 0-4c-3.86 0-7-3.141-7-7s3.14-7 7-7c.277 0 .723.068 1.193.162V46a2 2 0 0 0 4 0v-3.221C36.267 36.527 41.63 32 48 32s11.732 4.527 12.807 10.779V46a2 2 0 0 0 4 0v-1.838c.47-.094.915-.162 1.193-.162 3.859 0 7 3.141 7 7s-3.141 7-7 7a2 2 0 0 0 0 4c6.065 0 11-4.935 11-11s-4.935-11-11-11"/>
        <path d="M49.485 52.06a2 2 0 0 0-2.426 1.455l-6 24a2.001 2.001 0 0 0 3.881.97l6-24a2 2 0 0 0-1.455-2.425m7.999 6a1.997 1.997 0 0 0-2.425 1.455l-3 12a2 2 0 0 0 3.881.971l2.999-12a2 2 0 0 0-1.455-2.426m-19 0a2 2 0 0 0-2.425 1.455l-3 12a2 2 0 0 0 3.881.971l3-12a2 2 0 0 0-1.456-2.426"/>
      </svg>
    ),
    snow: (
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 96 96" fill="currentColor">
        <path d="M66 40c-.507 0-1.112.079-1.688.184C62.218 33.012 55.663 28 48 28s-14.218 5.012-16.311 12.184C31.112 40.079 30.507 40 30 40c-6.065 0-11 4.935-11 11s4.935 11 11 11a2 2 0 0 0 0-4c-3.86 0-7-3.141-7-7s3.14-7 7-7c.277 0 .723.068 1.193.162V46a2 2 0 0 0 4 0v-3.221C36.268 36.527 41.631 32 48 32s11.732 4.527 12.807 10.779V46a2 2 0 0 0 4 0v-1.838c.47-.094.916-.162 1.193-.162 3.859 0 7 3.141 7 7s-3.141 7-7 7a2 2 0 0 0 0 4c6.065 0 11-4.935 11-11s-4.935-11-11-11"/>
        <path d="M45.732 62.464a2 2 0 1 0-3.464 1.999l1 1.732a1.997 1.997 0 0 0 2.732.732 2 2 0 0 0 .732-2.732zm-5-8.66a2 2 0 1 0-3.464 1.999l1 1.732a1.997 1.997 0 0 0 2.732.733 2 2 0 0 0 .732-2.733z"/>
        <path d="M43 58.269a2 2 0 0 0 2.732-.733l1-1.732a2 2 0 1 0-3.464-2l-1 1.732A2 2 0 0 0 43 58.269m-2 3.462a2 2 0 0 0-2.732.733l-1 1.732a2 2 0 1 0 3.464 2l1-1.732A2 2 0 0 0 41 61.731"/>
        <path d="M40 60a2 2 0 0 0-2-2h-2a2 2 0 0 0 0 4h2a2 2 0 0 0 2-2m10 0a2 2 0 0 0-2-2h-2a2 2 0 0 0 0 4h2a2 2 0 0 0 2-2m10.732 11.268a2 2 0 0 0-3.464 2l1 1.732a1.997 1.997 0 0 0 2.732.732A2 2 0 0 0 61.732 73zm-5-8.661a2 2 0 0 0-3.464 2l1 1.732a1.997 1.997 0 0 0 2.732.733 2 2 0 0 0 .732-2.733z"/>
        <path d="M58 67.072a2 2 0 0 0 2.732-.733l1-1.732a2 2 0 1 0-3.464-2l-1 1.732A2 2 0 0 0 58 67.072m-2 3.463a2 2 0 0 0-2.732.732l-1 1.732A2 2 0 0 0 55.732 75l1-1.732A2 2 0 0 0 56 70.535"/>
        <path d="M55 68.804a2 2 0 0 0-2-2h-2a2 2 0 0 0 0 4h2a2 2 0 0 0 2-2m8-2h-2a2 2 0 0 0 0 4h2a2 2 0 0 0 0-4"/>
      </svg>
    ),
    thunder: (
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 96 96" fill="currentColor">
        <path d="M66 40c-.508 0-1.112.079-1.689.184C62.218 33.012 55.663 28 48 28s-14.219 5.012-16.312 12.184C31.112 40.079 30.507 40 30 40c-6.065 0-11 4.935-11 11s4.935 11 11 11h11.263l-3.927 5.891a2 2 0 0 0-.1 2.053A2 2 0 0 0 39 71h2.263l-3.927 5.891a2 2 0 0 0 3.328 2.218l6-9a2 2 0 0 0 .1-2.053A2 2 0 0 0 45 67h-2.263l3.333-5h5.192l-1.927 2.891a2 2 0 0 0-.1 2.053A2 2 0 0 0 51 68h2.263l-1.927 2.891a2 2 0 0 0 3.328 2.218l4-6a2 2 0 0 0 .1-2.053A2 2 0 0 0 57 64h-2.263l1.333-2H66c6.065 0 11-4.935 11-11s-4.935-11-11-11m0 18H30c-3.859 0-7-3.141-7-7s3.141-7 7-7c.277 0 .723.068 1.193.162V46a2 2 0 0 0 4 0v-3.219C36.266 36.528 41.629 32 48 32c6.37 0 11.733 4.528 12.807 10.782V46a2 2 0 0 0 4 0v-1.837c.47-.094.919-.163 1.193-.163 3.859 0 7 3.141 7 7s-3.141 7-7 7"/>
      </svg>
    ),
  };

  if (loading) {
    return (
      <div style={{ fontSize: 13, opacity: mutedOpacity }}>
        Laddar väder...
      </div>
    );
  }

  if (!weather) {
    return (
      <div style={{ fontSize: 13, opacity: mutedOpacity }}>
        Väderdata kunde inte hämtas
      </div>
    );
  }

  return (
    <>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>Just nu</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ opacity: mutedOpacity, display: "flex", alignItems: "center" }}>
          {weatherIcons[weather.weatherDescription] || weatherIcons.clear}
        </span>
        <span style={{ fontWeight: 800, fontSize: 18 }}>{weather.temperature}°</span>
      </div>
    </>
  );
}
