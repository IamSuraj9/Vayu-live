import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"

document.documentElement.classList.add("dark")
// Refraction through SVG backdrop filters only renders in Chromium; other browsers keep plain liquid glass
const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? []
if (brands.some(b => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand))) document.documentElement.dataset.lens = "on"
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>)
