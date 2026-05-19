class RzdApiClient {
  constructor(baseURL) {
    this.baseURL = baseURL || "https://api.мойпуть24.рф";
  }

  async request(url, options = {}) {
    try {
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
        },
        ...options,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      return await response.json();
    } catch (error) {
      console.error("API error:", error.message);
      throw error;
    }
  }

  // -----------------------------
  // 1. Поиск станций
  // -----------------------------
  async searchStations(query) {
    if (!query || query.length < 1) return [];

    const url = `${this.baseURL}/stations?q=${encodeURIComponent(query)}`;
    return this.request(url);
  }

  // -----------------------------
  // 2. Получение поездов
  // -----------------------------
  async getTrains(date, stationDepartureId, stationArrivalId) {
    if (!date || !stationDepartureId || !stationArrivalId) {
      return [];
    }

    const params = new URLSearchParams({
      date,
      station_departure_id: stationDepartureId,
      station_arrival_id: stationArrivalId,
    });

    const url = `${this.baseURL}/trains?${params.toString()}`;
    return this.request(url);
  }

  // -----------------------------
  // 3. Маршрут поезда
  // -----------------------------
  async getTrainRoute(trainNumberLatin, date) {
    if (!trainNumberLatin || !date) return [];

    const params = new URLSearchParams({
      train_number_latin: trainNumberLatin,
      date, // YYYY-MM-DD
    });

    const url = `${this.baseURL}/train-route?${params.toString()}`;
    return this.request(url);
  }
}

export default RzdApiClient;

/* Example usage:

<script type="module">
import RzdApiClient from './rzdApiClient.js';

const api = new RzdApiClient("https://api.мойпуть24.рф");

// Поиск станций
const stations = await api.searchStations("см");
console.log(stations);

// Поезда
const trains = await api.getTrains("05.05.2026", 2000006, 2000170);
console.log(trains);

// Маршрут (ВАЖНО: trainNumberLatin)
const route = await api.getTrainRoute("717MJ", "2026-05-06");
console.log(route);
</script>

*/
