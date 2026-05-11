from datetime import datetime
from typing import Any, Dict, List

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="RZD API Wrapper")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # или ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}


class RZDClient:
    def __init__(self, timeout: int = 10):
        self.session = requests.Session()
        self.session.headers.update(BASE_HEADERS)
        self.timeout = timeout

    def search_stations(self, query: str) -> List[Dict[str, Any]]:
        if not query:
            return []

        name = query.strip()[:2].upper()
        url = f"https://www.rzd.ru/suggests/rstation/?namePart={name}&lang=ru"

        try:
            r = self.session.get(url, timeout=self.timeout)
            r.raise_for_status()
            data = r.json()
        except Exception:
            return []

        result = []
        for item in data.get("data", []):
            node = item.get("node", {})
            if not node:
                continue

            result.append(
                {
                    "id": node.get("id"),
                    "compositeRegion": node.get("compositeRegion"),
                    "searchName": node.get("searchName"),
                    "suWeight": node.get("suWeight"),
                    "dtWeight": node.get("dtWeight"),
                }
            )

        return result

    def get_trains(self, date: str, dep_id: int, arr_id: int):
        url = "https://www.rzd.ru/tt/train/schedule"

        payload = {
            "departure": True,
            "date": date,
            "stationArrivalId": arr_id,
            "stationDepartureId": dep_id,
        }

        try:
            r = self.session.post(url, json=payload, timeout=self.timeout)
            r.raise_for_status()
            data = r.json()
        except Exception:
            return []

        return data.get("trains", [])

    def get_train_route(self, train_number_latin: str, date: str):
        url = f"https://www.rzd.ru/routemap/source/current/train/{train_number_latin}/departure/{date}?useTimeZone=true"

        try:
            r = self.session.get(url, timeout=self.timeout)
            r.raise_for_status()
            data = r.json()
        except Exception:
            return []

        result = []

        for feature in data.get("features", []):
            props = feature.get("properties", {})

            if props.get("stationType") != "SCHEDULE_PLAIN":
                continue

            is_current_station = props.get("current_station", False)

            result.append(
                {
                    "name": props.get("name"),
                    "departureTime": props.get("departureTime"),
                    "arrivalTime": props.get("arrivalTime"),
                    "departureDate": props.get("departureDate"),
                    "current_station": is_current_station,
                }
            )

        return result


client = RZDClient()


# -----------------------------
# 📍 1. Поиск станций
# -----------------------------
@app.get("/stations")
def search_stations(q: str = Query(..., min_length=1)):
    return client.search_stations(q)


# -----------------------------
# 🚆 2. Получение поездов
# -----------------------------
@app.get("/trains")
def get_trains(date: str, station_departure_id: int, station_arrival_id: int):
    """
    date формат: DD.MM.YYYY
    """

    try:
        datetime.strptime(date, "%d.%m.%Y")
    except ValueError:
        raise HTTPException(400, "Неверный формат даты. Используй DD.MM.YYYY")

    trains = client.get_trains(date, station_departure_id, station_arrival_id)

    # нормализация ответа
    result = []
    for train in trains:
        result.append(
            {
                "trainNumberRus": train.get("trainNumberRus"),
                "trainNumberLatin": train.get("trainNumberLatin"),
                "trainStartStation": train.get("trainStartStation"),
                "trainEndStation": train.get("trainEndStation"),
                "departureStation": train.get("departureStation"),
                "arrivalStation": train.get("arrivalStation"),
                "passStartStationDifferTrainStartStation": train.get(
                    "passStartStationDifferTrainStartStation"
                ),
            }
        )

    return result


# -----------------------------
# 🗺 3. Маршрут поезда
# -----------------------------
@app.get("/train-route")
def get_train_route(train_number_latin: str, date: str):
    """
    train_number_latin — ОБЯЗАТЕЛЬНО из trainNumberLatin
    date формат: YYYY-MM-DD
    """

    # валидация даты
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Дата должна быть в формате YYYY-MM-DD")

    route = client.get_train_route(train_number_latin, date)

    if not route:
        raise HTTPException(404, "Маршрут не найден")

    return route
