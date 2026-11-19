import type { Status } from "./api";

// Display names (static metadata, mirrors backend/aquagrid/network.py).
export const ASSET_NAMES: Record<string, string> = {
  "INT-01": "Offshore intake head",
  "IPS-01": "Intake pump station",
  "CHL-01": "Chlorophyll-a probe",
  "TURB-01": "Intake turbidity sensor",
  "PT-01": "Pretreatment",
  "SDI-01": "RO feed SDI sensor",
  "HPP-01": "High-pressure pumps",
  "RO-01": "RO train 1",
  "RO-02": "RO train 2",
  "ERD-01": "Energy recovery devices",
  "COND-01": "Product conductivity",
  "RES-01": "North reservoir",
  "RES-02": "Central reservoir",
  "RES-03": "South reservoir",
  "PS-01": "Transmission pumping station",
  "FM-PS": "Pumping station flow meter",
  "V-04A": "Sector 4 inlet valve",
  "V-04B": "Harbour branch isolation valve",
  "FM-S4": "Sector 4 inflow meter",
  "P-S3": "Sector 3 pressure sensor",
  "P-S4A": "Sector 4 pressure sensor A",
  "P-S4B": "Sector 4 pressure sensor B",
  "SEC-01": "Sector 1, North",
  "SEC-02": "Sector 2, East",
  "SEC-03": "Sector 3, Central",
  "SEC-04": "Sector 4, Harbour",
  "SEC-05": "Sector 5, South",
  "BR-4H": "Harbour branch",
};

export const ASSET_ROLE: Record<string, string> = {
  "INT-01": "A velocity cap 9 m below the surface draws seawater horizontally, which keeps fish and debris out.",
  "IPS-01": "Three duty pumps lift seawater to the plant. Screens remove anything larger than 3 mm.",
  "CHL-01": "Measures chlorophyll-a, the pigment that rises when algae multiply. An early signal of a bloom.",
  "TURB-01": "Measures cloudiness of the incoming seawater. Blooms and storms both raise it.",
  "PT-01": "Flotation and filters strip algae and particles so the membranes don't foul.",
  "SDI-01": "Silt density index of the water reaching the membranes. Above 3 the fouling risk climbs.",
  "HPP-01": "Pressurises feed to about 64 bar. This is where most of the plant's electricity goes.",
  "RO-01": "24 pressure vessels of spiral-wound membranes producing 300 m³/h.",
  "RO-02": "24 pressure vessels of spiral-wound membranes producing 300 m³/h.",
  "ERD-01": "Pressure exchangers hand the brine's leftover pressure back to the feed.",
  "COND-01": "Checks that product water salinity stays in specification before it leaves the plant.",
  "RES-01": "3,000 m³ of treated water storage.",
  "RES-02": "4,000 m³ of treated water storage, the largest of the three.",
  "RES-03": "3,000 m³ of treated water storage.",
  "PS-01": "Lifts stored water into the trunk mains that feed all five sectors.",
  "FM-PS": "Total flow leaving the pumping station.",
  "V-04A": "Main inlet to Sector 4. Closing it would cut supply to the whole sector, including the hospital.",
  "V-04B": "Isolates the Harbour branch, 140 connections at the end of Sector 4.",
  "FM-S4": "Measures everything entering Sector 4. The basis of the flow balance.",
  "P-S3": "Pressure in neighbouring Sector 3, used to tell a local problem from a network-wide one.",
  "P-S4A": "Pressure at the Sector 4 junction, upstream of the Harbour branch.",
  "P-S4B": "Pressure on the Harbour branch.",
  "SEC-01": "1,900 connections, mostly villas.",
  "SEC-02": "2,300 connections, mixed residential.",
  "SEC-03": "2,600 connections, the commercial centre.",
  "SEC-04": "2,180 connections, including Al Noor Hospital.",
  "SEC-05": "1,700 connections, low-rise residential.",
  "BR-4H": "140 connections along the harbour front, fed through V-04B.",
};

export function statusLabel(s: Status | undefined): string {
  switch (s) {
    case "critical": return "incident";
    case "alarm": return "alarm";
    case "warning": return "warning";
    case "watch": return "under watch";
    case "fault": case "flatline": return "flatline";
    case "quarantined": return "quarantined";
    case "closed": return "closed";
    case "isolated": return "isolated";
    default: return "normal";
  }
}

export const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  normal: { bg: "#caf0f8", fg: "#000", label: "Normal" },
  watch: { bg: "#ffe1b3", fg: "#000", label: "Under watch" },
  warning: { bg: "#ffe1b3", fg: "#000", label: "Warning" },
  alarm: { bg: "#ffd0d5", fg: "#000", label: "Alarm" },
  critical: { bg: "#ffd0d5", fg: "#000", label: "Incident" },
  fault: { bg: "#ffe1b3", fg: "#000", label: "Flatline" },
  flatline: { bg: "#ffe1b3", fg: "#000", label: "Flatline" },
  quarantined: { bg: "#e5e7eb", fg: "#000", label: "Quarantined" },
  closed: { bg: "#fff44f", fg: "#000", label: "Closed" },
  isolated: { bg: "#e5e7eb", fg: "#000", label: "Isolated" },
};
