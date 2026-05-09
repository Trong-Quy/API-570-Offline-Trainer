import type { CalcDefinition } from "../../types";

const R = (min: number, max: number, decimals = 3) => {
  const v = Math.random() * (max - min) + min;
  return parseFloat(v.toFixed(decimals));
};

export const CALCULATORS: CalcDefinition[] = [
  {
    id: "corrosion_rate",
    title: "Corrosion Rate",
    formula: "CR = (t_prev − t_curr) ÷ Δt",
    reference: "API 570 §7.1",
    fields: [
      { key: "t_prev", label: "Previous Thickness (t_prev)", unit: "inches", hint: "Measured at earlier inspection", min: 0.1, max: 1.5, step: 0.001 },
      { key: "t_curr", label: "Current Thickness (t_curr)", unit: "inches", hint: "Most recent measurement", min: 0.05, max: 1.4, step: 0.001 },
      { key: "dt", label: "Time Interval (Δt)", unit: "years", hint: "Years between measurements", min: 0.5, max: 20, step: 0.5 },
    ],
    compute: ({ t_prev, t_curr, dt }) => {
      const cr = (t_prev - t_curr) / dt;
      const mpy = cr * 1000;
      return {
        value: parseFloat(mpy.toFixed(2)),
        unit: "mpy (mils/year)",
        steps: [
          `CR = (t_prev − t_curr) ÷ Δt`,
          `CR = (${t_prev} − ${t_curr}) ÷ ${dt}`,
          `CR = ${(t_prev - t_curr).toFixed(4)} ÷ ${dt}`,
          `CR = ${cr.toFixed(5)} in/yr`,
          `CR = ${mpy.toFixed(2)} mils/year (mpy)`,
        ],
      };
    },
    randomize: () => {
      const t_prev = R(0.3, 1.0);
      const loss = R(0.01, 0.12);
      const t_curr = parseFloat((t_prev - loss).toFixed(3));
      return { t_prev, t_curr, dt: R(1, 10, 1) };
    },
  },

  {
    id: "remaining_life",
    title: "Remaining Life",
    formula: "RL = (t_curr − t_min) ÷ CR",
    reference: "API 570 §7.1.1",
    fields: [
      { key: "t_curr", label: "Current Thickness (t_curr)", unit: "inches", min: 0.1, max: 1.5, step: 0.001 },
      { key: "t_min", label: "Minimum Required Thickness (t_min)", unit: "inches", hint: "From pressure design calculation", min: 0.05, max: 1.0, step: 0.001 },
      { key: "cr", label: "Corrosion Rate (CR)", unit: "mpy", hint: "mils per year (1 mpy = 0.001 in/yr)", min: 1, max: 100, step: 0.5 },
    ],
    compute: ({ t_curr, t_min, cr }) => {
      const cr_iny = cr / 1000;
      const rl = (t_curr - t_min) / cr_iny;
      const next = rl / 2;
      return {
        value: parseFloat(rl.toFixed(1)),
        unit: "years",
        steps: [
          `RL = (t_curr − t_min) ÷ CR`,
          `Convert CR: ${cr} mpy = ${cr_iny.toFixed(4)} in/yr`,
          `RL = (${t_curr} − ${t_min}) ÷ ${cr_iny.toFixed(4)}`,
          `RL = ${(t_curr - t_min).toFixed(4)} ÷ ${cr_iny.toFixed(4)}`,
          `RL = ${rl.toFixed(1)} years`,
          `Max next inspection interval = RL ÷ 2 = ${next.toFixed(1)} years`,
          `(subject to piping class maximum — API 570 §6.1)`,
        ],
        pass: (t_curr - t_min) > 0,
        passLabel: (t_curr - t_min) > 0 ? "Sufficient life remaining" : "BELOW t_min — RETIRE PIPE",
      };
    },
    randomize: () => {
      const t_curr = R(0.25, 0.8);
      const t_min = parseFloat((t_curr * R(0.4, 0.85)).toFixed(3));
      return { t_curr, t_min, cr: R(3, 40, 1) };
    },
  },

  {
    id: "next_inspection",
    title: "Next Inspection Interval",
    formula: "Next = min(RL÷2, class_max)",
    reference: "API 570 §6.1 + §7.1",
    fields: [
      { key: "rl", label: "Remaining Life (RL)", unit: "years", min: 0.5, max: 100, step: 0.5 },
      { key: "pipe_class", label: "Piping Class (1=Class1, 2=Class2, 3=Class3)", unit: "", hint: "1=5yr max, 2=10yr max, 3=10yr max", min: 1, max: 3, step: 1 },
    ],
    compute: ({ rl, pipe_class }) => {
      const half = rl / 2;
      const classMax = pipe_class === 1 ? 5 : 10;
      const next = Math.min(half, classMax);
      const governs = half <= classMax ? "half-life rule" : `Class ${pipe_class} maximum`;
      return {
        value: parseFloat(next.toFixed(1)),
        unit: "years",
        steps: [
          `Half remaining life = RL ÷ 2 = ${rl} ÷ 2 = ${half.toFixed(1)} years`,
          `Class ${pipe_class} maximum interval = ${classMax} years`,
          `Next inspection = min(${half.toFixed(1)}, ${classMax}) = ${next.toFixed(1)} years`,
          `Governing criterion: ${governs}`,
        ],
      };
    },
    randomize: () => ({
      rl: R(2, 40, 1),
      pipe_class: Math.floor(Math.random() * 3) + 1,
    }),
  },

  {
    id: "mawp",
    title: "Maximum Allowable Working Pressure",
    formula: "MAWP = 2SEt ÷ (D − 2Yt)",
    reference: "ASME B31.3 §304.1.2",
    fields: [
      { key: "S", label: "Allowable Stress (S)", unit: "psi", hint: "From ASME B31.3 Table A-1", min: 10000, max: 30000, step: 500 },
      { key: "E", label: "Quality Factor (E)", unit: "", hint: "1.0 = seamless, 0.85 = ERW", min: 0.6, max: 1.0, step: 0.05 },
      { key: "t", label: "Actual Wall Thickness (t)", unit: "inches", min: 0.05, max: 2.0, step: 0.001 },
      { key: "D", label: "Outside Diameter (D)", unit: "inches", hint: "OD", min: 0.5, max: 24, step: 0.125 },
      { key: "Y", label: "Temperature Coefficient (Y)", unit: "", hint: "0.4 for CS at T ≤ 900°F", min: 0.3, max: 0.7, step: 0.05 },
    ],
    compute: ({ S, E, t, D, Y }) => {
      const mawp = (2 * S * E * t) / (D - 2 * Y * t);
      return {
        value: parseFloat(mawp.toFixed(0)),
        unit: "psig",
        steps: [
          `MAWP = 2SEt ÷ (D − 2Yt)`,
          `Numerator = 2 × ${S} × ${E} × ${t} = ${(2 * S * E * t).toFixed(1)}`,
          `Denominator = ${D} − 2 × ${Y} × ${t} = ${(D - 2 * Y * t).toFixed(4)}`,
          `MAWP = ${(2 * S * E * t).toFixed(1)} ÷ ${(D - 2 * Y * t).toFixed(4)}`,
          `MAWP = ${mawp.toFixed(0)} psig`,
        ],
      };
    },
    randomize: () => ({
      S: [17500, 20000, 15000, 16700, 18800][Math.floor(Math.random() * 5)],
      E: [1.0, 0.85, 0.80][Math.floor(Math.random() * 3)],
      t: R(0.1, 0.6),
      D: [2.375, 3.5, 4.5, 6.625, 8.625, 10.75, 12.75][Math.floor(Math.random() * 7)],
      Y: 0.4,
    }),
  },

  {
    id: "hydrotest",
    title: "Hydrotest Pressure",
    formula: "P_test = 1.5 × MAWP × (S_test ÷ S_design)",
    reference: "ASME B31.3 §345.4.2",
    fields: [
      { key: "mawp", label: "MAWP (or Design Pressure)", unit: "psig", min: 50, max: 5000, step: 25 },
      { key: "s_test", label: "Allowable Stress at Test Temp (S_test)", unit: "psi", hint: "Usually S at ambient", min: 10000, max: 30000, step: 500 },
      { key: "s_design", label: "Allowable Stress at Design Temp (S_design)", unit: "psi", min: 10000, max: 30000, step: 500 },
    ],
    compute: ({ mawp, s_test, s_design }) => {
      const ratio = Math.min(s_test / s_design, 1.0);
      const p_test = 1.5 * mawp * ratio;
      return {
        value: parseFloat(p_test.toFixed(0)),
        unit: "psig",
        steps: [
          `P_test = 1.5 × MAWP × (S_test ÷ S_design)`,
          `Stress ratio = ${s_test} ÷ ${s_design} = ${ratio.toFixed(3)}`,
          `P_test = 1.5 × ${mawp} × ${ratio.toFixed(3)}`,
          `P_test = ${p_test.toFixed(0)} psig`,
          ratio >= 1.0
            ? `Note: S_test/S_design ≥ 1.0, so P_test = 1.5 × MAWP`
            : `Note: S_test < S_design (elevated design temp), ratio applied`,
        ],
      };
    },
    randomize: () => {
      const mawp = Math.round(R(100, 2000, 0) / 25) * 25;
      const s_design = [17500, 16700, 15000, 14400][Math.floor(Math.random() * 4)];
      const s_test = [20000, 17500, 20000, 20000][Math.floor(Math.random() * 4)];
      return { mawp, s_test, s_design };
    },
  },

  {
    id: "wall_thickness",
    title: "Minimum Wall Thickness",
    formula: "t = PD ÷ [2(SEW + PY)]",
    reference: "ASME B31.3 §304.1.2",
    fields: [
      { key: "P", label: "Design Pressure (P)", unit: "psig", min: 50, max: 5000, step: 25 },
      { key: "D", label: "Outside Diameter (D)", unit: "inches", min: 0.5, max: 24, step: 0.125 },
      { key: "S", label: "Allowable Stress (S)", unit: "psi", min: 10000, max: 30000, step: 500 },
      { key: "E", label: "Quality Factor (E)", unit: "", hint: "1.0 seamless, 0.85 ERW", min: 0.6, max: 1.0, step: 0.05 },
      { key: "W", label: "Weld Joint Reduction (W)", unit: "", hint: "Usually 1.0 for most cases", min: 0.5, max: 1.0, step: 0.05 },
      { key: "Y", label: "Coefficient Y", unit: "", hint: "0.4 for CS ≤ 900°F", min: 0.3, max: 0.7, step: 0.05 },
    ],
    compute: ({ P, D, S, E, W, Y }) => {
      const t = (P * D) / (2 * (S * E * W + P * Y));
      const t_ordered = t * 1.125; // + 12.5% mill tolerance
      return {
        value: parseFloat(t.toFixed(4)),
        unit: "inches (calculated minimum)",
        steps: [
          `t = PD ÷ [2(SEW + PY)]`,
          `Numerator = ${P} × ${D} = ${(P * D).toFixed(2)}`,
          `Denominator = 2 × (${S} × ${E} × ${W} + ${P} × ${Y})`,
          `         = 2 × (${(S * E * W).toFixed(0)} + ${(P * Y).toFixed(1)})`,
          `         = 2 × ${(S * E * W + P * Y).toFixed(1)} = ${(2 * (S * E * W + P * Y)).toFixed(1)}`,
          `t_calc = ${(P * D).toFixed(2)} ÷ ${(2 * (S * E * W + P * Y)).toFixed(1)} = ${t.toFixed(4)} in`,
          `t_min ordered = t ÷ 0.875 = ${t_ordered.toFixed(4)} in (add 12.5% mill tolerance)`,
        ],
      };
    },
    randomize: () => ({
      P: Math.round(R(100, 1500, 0) / 25) * 25,
      D: [2.375, 3.5, 4.5, 6.625, 8.625, 10.75][Math.floor(Math.random() * 6)],
      S: [17500, 20000, 16700, 15000][Math.floor(Math.random() * 4)],
      E: 1.0,
      W: 1.0,
      Y: 0.4,
    }),
  },
];
