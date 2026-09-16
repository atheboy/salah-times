<div align="center">

# ☽ SalahTimes

### Live, Location-Based Islamic Prayer Times App

![SalahTimes Preview](mosque_hero.jpg)

[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)
![HTML](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![No Build Step](https://img.shields.io/badge/No%20Build%20Step-required-green)

**SalahTimes** is a beautiful, zero-dependency, browser-based Islamic prayer times app.  
It auto-detects your location and shows you live, accurate Salah times with a real-time countdown — no login, no API key, no install.

[🌐 Live Demo](#usage) · [✨ Features](#features) · [🚀 Getting Started](#getting-started)

</div>

---

## ✨ Features

- 📍 **GPS Auto-Detection** — Uses the browser Geolocation API for precise coordinates
- 🔍 **Manual City Search** — Fallback to any city worldwide
- ⏱️ **Live Countdown** — Ticking seconds until the next prayer with a flip animation
- 🕐 **Real-Time Clock** — 24-hour live clock always visible
- 🌙 **Hijri Date** — Islamic calendar date displayed alongside Gregorian
- 📿 **All 5 Daily Prayers** — Fajr, Dhuhr, Asr, Maghrib, Isha with Arabic names (الفجر، الظهر، العصر، المغرب، العشاء)
- ✅ **Smart Status Badges** — Prayer cards automatically show Current / Next / Passed
- 📊 **Progress Bar** — Visual progress through the current prayer interval
- 🌆 **Stunning UI** — Dark mode, animated stars, mosque silhouette, glassmorphism cards, gold Islamic aesthetic

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Structure | HTML5 |
| Styling | Vanilla CSS (glassmorphism, CSS animations, custom properties) |
| Logic | Vanilla JavaScript (ES2020+) |
| Prayer Times API | [Aladhan.com](https://aladhan.com/prayer-times-api) *(free, no key)* |
| Reverse Geocoding | [OpenStreetMap Nominatim](https://nominatim.org/) *(free, no key)* |
| Fonts | Google Fonts — Outfit + Amiri |

No frameworks. No build step. No dependencies. Just open and go.

---

## 🚀 Getting Started

### Option 1 — Open directly in browser
```bash
# Clone the repo
git clone https://github.com/atheboy/salah-times.git
cd salah-times

# Open index.html in your browser
start index.html       # Windows
open index.html        # macOS
xdg-open index.html    # Linux
```

### Option 2 — Serve locally (recommended for location API)
```bash
# Using Node.js / npx
npx serve .

# Or Python
python -m http.server 3000
```
Then open **http://localhost:3000** in your browser.

> **Note:** The browser Geolocation API requires either `localhost` or `https://` — serving locally via HTTP is fine.

---

## 📖 Usage

1. Open the app in your browser
2. Click **"Enable Location"** and allow the browser permission prompt
3. Prayer times for your location load instantly ✅

**If location is blocked:**
- Chrome: Click the 🔒 lock icon → Site settings → Location → Allow
- Or use the **"Or enter city manually"** link and type any city name

---

## 🗂️ Project Structure

```
salah-times/
├── index.html       # App shell & all screens (location, loading, error, prayer)
├── style.css        # Full design system — dark mode, animations, glassmorphism
├── app.js           # All app logic — geolocation, API calls, live clock, countdown
├── mosque_hero.jpg  # Hero background image
└── README.md        # This file
```

---

## 🌐 APIs Used

### Aladhan Prayer Times API
```
GET https://api.aladhan.com/v1/timings/{date}?latitude={lat}&longitude={lon}&method=2
```
Returns prayer times for a given date and coordinates. Method `2` = ISNA. [Full docs →](https://aladhan.com/prayer-times-api)

### Nominatim Reverse Geocoding
```
GET https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json
```
Converts GPS coordinates to a human-readable city name.

---

## 🙏 Acknowledgements

- [Aladhan.com](https://aladhan.com) for the free, accurate prayer times API
- [OpenStreetMap Nominatim](https://nominatim.org/) for geocoding
- [Google Fonts](https://fonts.google.com/) for Outfit & Amiri typefaces

---

## 📄 License

MIT © [Abdullah Mushtaq](https://github.com/atheboy)

---

<div align="center">

Made with ☽ and ✨ — may your prayers be accepted.

</div>
