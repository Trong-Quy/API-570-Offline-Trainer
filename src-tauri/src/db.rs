use rusqlite::{Connection, Result as SqlResult, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Question {
    pub id: i64,
    pub source_document: String,
    pub clause: Option<String>,
    pub topic: String,
    pub difficulty: i32,
    pub question_text: String,
    pub option_a: String,
    pub option_b: String,
    pub option_c: String,
    pub option_d: String,
    pub correct_answer: String,
    pub explanation: String,
    pub ai_explanation: Option<String>,
    pub tags: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Flashcard {
    pub id: i64,
    pub topic: String,
    pub front: String,
    pub back: String,
    pub ease_factor: f64,
    pub interval: i32,
    pub repetitions: i32,
    pub next_review: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Bookmark {
    pub id: i64,
    pub pdf_name: String,
    pub pdf_path: String,
    pub page: i32,
    pub note: Option<String>,
    pub highlight_text: Option<String>,
    pub color: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExamAnswer {
    pub question_id: i64,
    pub selected_answer: String,
    pub is_correct: bool,
    pub time_taken_seconds: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct QuestionFilter {
    pub topic: Option<String>,
    pub difficulty: Option<i32>,
    pub source_document: Option<String>,
    pub limit: Option<i32>,
    pub shuffle: Option<bool>,
    pub weak_topics: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UserStats {
    pub total_questions_answered: i32,
    pub total_correct: i32,
    pub total_exams: i32,
    pub avg_score: f64,
    pub weak_topics: Vec<TopicStat>,
    pub strong_topics: Vec<TopicStat>,
    pub streak_days: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TopicStat {
    pub topic: String,
    pub correct: i32,
    pub total: i32,
    pub accuracy: f64,
}

pub fn get_db_path(app: &AppHandle) -> PathBuf {
    let data_dir = app.path().app_data_dir().expect("No app data dir");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("api570.db")
}

pub fn open_db(app: &AppHandle) -> SqlResult<Connection> {
    Connection::open(get_db_path(app))
}

pub fn sm2_algorithm(ef: f64, interval: i32, reps: i32, quality: i32) -> (f64, i32, i32) {
    if quality < 3 {
        return (ef, 1, 0);
    }
    let q = quality as f64;
    let new_ef = (ef + (0.1 - (5.0 - q) * (0.08 + (5.0 - q) * 0.02))).max(1.3);
    let new_interval = match reps {
        0 => 1,
        1 => 6,
        _ => (interval as f64 * ef).round() as i32,
    };
    (new_ef, new_interval, reps + 1)
}

pub fn get_seed_questions() -> Vec<(&'static str, &'static str, &'static str, i32, &'static str, &'static str, &'static str, &'static str, &'static str, &'static str, &'static str, &'static str)> {
    vec![
        ("API 570", "6.1", "Inspection Intervals", 2,
         "According to API 570, what is the maximum interval for thickness measurement inspection of Class 1 piping circuits?",
         "3 years", "5 years", "7 years", "10 years", "B",
         "API 570 Section 6.1 specifies that Class 1 piping circuits shall have thickness measurements taken at maximum 5-year intervals. Class 1 represents the highest risk category including flammable, toxic, or high-pressure services.",
         "inspection intervals,Class 1,thickness measurement"),
        ("API 570", "6.1", "Inspection Intervals", 2,
         "According to API 570, what is the maximum inspection interval for thickness measurement of Class 2 piping circuits?",
         "5 years", "7 years", "10 years", "15 years", "C",
         "API 570 Section 6.1 states that Class 2 piping systems have a maximum thickness measurement interval of 10 years.",
         "inspection intervals,Class 2,thickness measurement"),
        ("API 570", "6.1", "Inspection Intervals", 2,
         "According to API 570, Class 3 piping circuits have a maximum thickness measurement interval of:",
         "5 years", "10 years", "15 years", "20 years", "B",
         "Class 3 piping (lowest risk) has a maximum thickness measurement interval of 10 years per API 570 Section 6.1.",
         "inspection intervals,Class 3"),
        ("API 570", "5.1", "Piping Circuit Classification", 1,
         "Which of the following services would be classified as Class 1 piping under API 570?",
         "Cooling water at 50 psi", "Compressed air at 150 psi", "Hydrogen service at high pressure", "Steam condensate at low pressure", "C",
         "Class 1 piping includes services most likely to cause immediate personnel injury. Hydrogen at high pressure is flammable and poses high risk. API 570 Section 5.1.1.",
         "classification,Class 1,hydrogen,flammable"),
        ("API 570", "7.1", "Corrosion Rate Calculation", 3,
         "A pipe has an initial thickness of 0.500 inches measured 5 years ago. Current measurement shows 0.450 inches. What is the corrosion rate in mils per year (mpy)?",
         "5 mpy", "8 mpy", "10 mpy", "12 mpy", "C",
         "Corrosion rate = (t_initial - t_current) / time = (0.500 - 0.450) / 5 = 0.010 in/yr = 10 mpy.",
         "corrosion rate,calculation,thickness"),
        ("API 570", "7.1.1", "Remaining Life Calculation", 3,
         "A pipe has current thickness of 0.400 inches, t_min of 0.250 inches, and a corrosion rate of 15 mpy. What is the remaining life?",
         "6.7 years", "8.5 years", "10.0 years", "12.3 years", "C",
         "Remaining Life = (t_current - t_min) / CR = (0.400 - 0.250) / 0.015 = 10.0 years.",
         "remaining life,calculation,corrosion rate"),
        ("API 570", "7.2", "Dead Legs", 2,
         "Which best describes a dead leg in piping systems?",
         "A section of pipe with no flow that may accumulate corrosive products",
         "A pipe section that has exceeded its design pressure",
         "A bypass line in active service",
         "A pipe section with excessive vibration", "A",
         "Dead legs are sections of piping with little or no flow. They are prone to corrosion, MIC, and pitting due to stagnant conditions.",
         "dead legs,stagnant,corrosion,inspection"),
        ("API 570", "8.1", "CUI - Corrosion Under Insulation", 2,
         "What temperature range is most susceptible to CUI for carbon steel?",
         "-20°F to 100°F", "10°F to 350°F", "25°F to 250°F", "100°F to 500°F", "B",
         "CUI on carbon steel is most prevalent in 10°F to 350°F where moisture can condense and remain in contact with the pipe surface.",
         "CUI,corrosion under insulation,temperature,carbon steel"),
        ("API 570", "9.1", "Hydrotest Pressure", 3,
         "A Class 2 piping system has MAWP of 300 psig. What is the minimum hydrotest pressure?",
         "300 psig", "375 psig", "450 psig", "600 psig", "C",
         "Hydrotest pressure = 1.5 × MAWP = 1.5 × 300 = 450 psig per ASME B31.3.",
         "hydrotest,MAWP,pressure test,ASME B31.3"),
        ("ASME B31.3", "304.1.1", "Wall Thickness Calculation", 3,
         "Using ASME B31.3: P=500 psi, OD=4.5 in, S=20,000 psi, E=1.0, W=1.0, Y=0.4. Find minimum wall thickness.",
         "0.053 inches", "0.056 inches", "0.061 inches", "0.068 inches", "B",
         "t = PD/(2(SE+PY)) = (500×4.5)/(2×(20000+500×0.4)) = 2250/40400 = 0.0557 ≈ 0.056 inches.",
         "wall thickness,calculation,ASME B31.3,pressure design"),
        ("API 570", "6.3", "External Inspection", 2,
         "What is the maximum interval for external visual inspection of aboveground piping per API 570?",
         "1 year", "3 years", "5 years", "10 years", "C",
         "API 570 Section 6.3 specifies external visual inspections at maximum 5-year intervals.",
         "external inspection,visual inspection,interval"),
        ("API 570", "7.3.1", "PWHT Requirements", 2,
         "PWHT is typically required for carbon steel weld repairs when wall thickness exceeds:",
         "0.500 inches", "0.750 inches", "1.000 inches", "1.500 inches", "B",
         "PWHT is generally required for carbon steel when thickness exceeds 0.750 inches (19mm) for P1 materials.",
         "PWHT,post-weld heat treatment,weld repair,carbon steel"),
        ("API 570", "5.5", "Injection Points", 2,
         "Why are injection points given special attention in API 570 inspection programs?",
         "They are located at high elevation",
         "They experience localized corrosion and turbulence causing rapid deterioration",
         "They are made of stainless steel",
         "They operate at temperatures too high for standard inspection", "B",
         "Injection points are subject to localized corrosion, erosion-corrosion, and turbulence. API 570 Section 5.5 requires enhanced inspection within ±12 inches.",
         "injection points,corrosion,turbulence,localized attack"),
        ("API 571", "3.1", "Damage Mechanisms - HIC", 3,
         "Hydrogen Induced Cracking (HIC) is most associated with which environment?",
         "High-temperature steam above 750°F",
         "Wet H2S service — hydrogen charging of steel",
         "High-pressure CO2 service above 100 psi",
         "Oxygen-saturated cooling water", "B",
         "HIC occurs when atomic hydrogen from wet H2S diffuses into steel and recombines at internal defects. API 571 Section 3.1.",
         "HIC,hydrogen induced cracking,wet H2S,damage mechanisms"),
        ("API 570", "10.1", "Repairs - Temporary Repairs", 2,
         "A composite wrap temporary repair on a piping system per API 570:",
         "Can remain indefinitely without re-inspection",
         "Must be replaced within 6 months",
         "Requires engineering assessment and must be re-inspected",
         "Is not permitted under any circumstances", "C",
         "API 570 Section 10.1 requires engineering assessment for composite wrap repairs. They are not permanent solutions.",
         "temporary repair,composite wrap,fitness for service"),
        ("API 570", "4.3", "Inspection Records", 1,
         "API 570 requires inspection records to include:",
         "Only initial construction records",
         "Thickness measurements, inspection dates, CMLs, and corrosion rate data",
         "Only records of repairs and alterations",
         "Personnel qualification records only", "B",
         "API 570 Section 4.3 requires thickness measurements, CML dates, corrosion rates, remaining life, and repair records.",
         "inspection records,CML,documentation,thickness"),
        ("API 570", "6.2", "Condition Monitoring Locations", 2,
         "CMLs should be prioritized at which locations?",
         "Straight pipe sections away from supports",
         "Injection points, dead legs, elbows, and areas of expected high corrosion",
         "Only at flanged connections",
         "Only at high-elevation locations", "B",
         "CMLs per API 570 Section 6.2 should be at injection points, dead legs, elbows/tees, low points, and high-consequence areas.",
         "CML,condition monitoring,corrosion locations,inspection planning"),
        ("API 570", "5.2", "MAWP Calculation", 3,
         "A CS pipe has OD=6.625 in, t=0.280 in, S=17,500 psi, E=1.0, Y=0.4. Calculate MAWP.",
         "892 psi", "1,025 psi", "1,530 psi", "1,284 psi", "C",
         "MAWP = 2SEt/(D-2Yt) = 2(17500)(1.0)(0.280)/(6.625-2(0.4)(0.280)) = 9800/6.401 ≈ 1,530 psi.",
         "MAWP,calculation,pressure rating"),
        ("API 570", "6.4", "NDE Methods - RT vs UT", 2,
         "For measuring wall thickness at CUI locations on insulated piping without removing insulation, which NDE method is preferred?",
         "Magnetic Particle Testing (MT)",
         "Radiographic Testing (RT) with profile technique",
         "Pulsed Eddy Current (PEC) testing",
         "Dye Penetrant Testing (PT)", "C",
         "Pulsed Eddy Current (PEC) measures wall thickness through insulation without removal, ideal for CUI screening.",
         "CUI,PEC,pulsed eddy current,NDE,insulation"),
        ("API 570", "7.4", "MAWP Calculation", 3,
         "For MAWP calculation on in-service piping per API 570, which thickness value should be used?",
         "Nominal thickness", "Minimum required thickness", "Actual measured thickness", "Design thickness", "C",
         "For in-service MAWP calculation, the actual measured (current) wall thickness is used.",
         "MAWP,thickness,in-service"),

        // ── Additional Questions ────────────────────────────────────────────
        ("API 570", "5.4", "Small-bore Piping", 2,
         "Per API 570, small-bore piping (NPS 2 and smaller) is typically:",
         "Subject to the same inspection requirements as large-bore piping",
         "Excluded from all inspection requirements",
         "Subject to a simplified inspection approach based on representative sampling",
         "Inspected only when leaks are detected", "C",
         "API 570 Section 5.4 allows small-bore piping to be inspected using representative sampling — selecting representative circuits and applying findings to similar systems.",
         "small-bore piping,inspection,sampling"),

        ("API 570", "8.2", "Soil-to-Air Interface", 2,
         "Piping at soil-to-air interfaces requires special inspection attention primarily because of:",
         "Excessive vibration from ground movement",
         "Accelerated external corrosion due to moisture and oxygen concentration",
         "High internal erosion from flow turbulence",
         "Stress concentration from soil settlement", "B",
         "The soil-to-air interface is a zone of accelerated external corrosion where the pipe transitions from buried (anaerobic/cathodic protection) to atmospheric conditions, creating a concentration cell for corrosion.",
         "soil-to-air,external corrosion,inspection"),

        ("API 571", "3.2", "Damage Mechanisms - Erosion", 2,
         "Erosion-corrosion in piping is most likely at which location?",
         "Long straight horizontal runs", "Low-point drains in stagnant service",
         "Elbows, tees, and reducers in high-velocity flow", "Flange faces in gasket contact", "C",
         "Erosion-corrosion occurs where turbulent flow, direction changes, or velocity increase remove the protective oxide layer. Elbows, tees, reducers, and downstream of valves/orifices are most susceptible.",
         "erosion-corrosion,velocity,turbulence,elbows"),

        ("API 571", "3.3", "Damage Mechanisms - High-Temp H2/H2S", 3,
         "The Nelson Curves (API 941) are used to evaluate resistance to which damage mechanism?",
         "Wet H2S cracking (SSC/HIC)", "High-temperature hydrogen attack (HTHA)",
         "Chloride stress corrosion cracking", "Amine stress corrosion cracking", "B",
         "Nelson Curves per API 941 define the safe operating limits for carbon and alloy steels in hydrogen service at elevated temperatures, guarding against High Temperature Hydrogen Attack (HTHA).",
         "HTHA,Nelson curves,API 941,hydrogen,high temperature"),

        ("API 570", "10.2", "Fitness for Service", 2,
         "API 579-1/ASME FFS-1 is used to evaluate:",
         "New piping construction specifications",
         "Whether in-service equipment with flaws or damage is safe to continue operating",
         "Welding procedure qualification requirements",
         "Maximum allowable inspection intervals", "B",
         "API 579-1/ASME FFS-1 provides methodologies for Fitness-For-Service (FFS) assessments to determine if equipment with damage, flaws, or degradation can continue safe operation.",
         "fitness for service,FFS,API 579,ASME"),

        ("ASME B31.3", "302.2.4", "Pipe Stress - Sustained Loads", 3,
         "In ASME B31.3, the equation for sustained stress (pressure + weight) must satisfy:",
         "S_L ≤ 1.33 × S_h", "S_L ≤ S_h", "S_L ≤ 0.75 × S_h", "S_L ≤ 1.5 × S_h", "B",
         "Per ASME B31.3, the sum of longitudinal stresses due to pressure, weight, and other sustained loads (S_L) shall not exceed the basic allowable stress S_h at the design temperature.",
         "sustained stress,longitudinal stress,ASME B31.3,pipe stress"),

        ("API 570", "7.5", "Rerating", 3,
         "A piping circuit needs to be rerated to a higher MAWP. Which of the following is NOT a requirement per API 570?",
         "Recalculate wall thickness requirements for new MAWP",
         "Verify all components are suitable for new conditions",
         "Perform a hydrotest at 1.5× new MAWP",
         "Replace all flanges with the next higher pressure class", "D",
         "API 570 rerating requires recalculation, component verification, and typically a hydrotest. There is no blanket requirement to replace all flanges to the next class — existing flanges are evaluated for suitability.",
         "rerating,MAWP,hydrotest,flanges"),

        ("API 570", "9.4", "Pressure Testing - Alternatives", 2,
         "When a hydrotest is not practical, API 570 allows which alternative test?",
         "Visual inspection only", "Pneumatic test with appropriate precautions",
         "Radiographic examination of all welds", "Ultrasonic testing of all welds", "B",
         "API 570 Section 9.4 allows pneumatic testing when hydrostatic testing is not practical, subject to engineering review, safety precautions, and appropriate test pressure limits.",
         "pressure test,pneumatic test,hydrotest alternative"),

        ("API 571", "4.1", "Amine Corrosion", 2,
         "Amine corrosion in refinery systems is most severe in areas with:",
         "Low temperature and low amine concentration",
         "High velocity, turbulence, and lean amine solutions",
         "Stagnant flow and rich amine",
         "Low velocity and high pH", "B",
         "Amine corrosion is accelerated by high flow velocity, turbulence (elbows, pumps, heat exchangers), and lean amine solutions which are more corrosive than rich amine.",
         "amine corrosion,velocity,turbulence,refinery"),

        ("API 570", "6.5", "Online Leak Sealing", 2,
         "Online leak sealing (injection sealant into a leak) on a piping system per API 570:",
         "Is considered a permanent repair method",
         "Is prohibited on hydrocarbon services",
         "Requires engineering review and is considered a temporary repair",
         "Can be applied without management approval", "C",
         "Online leak sealing is considered a temporary repair method under API 570. It requires engineering review, management approval, and plans for permanent repair.",
         "leak sealing,temporary repair,online repair"),

        ("API 578", "6.1", "PMI - Verification Rate", 2,
         "Per API 578, what percentage of alloy piping welds should receive Positive Material Identification (PMI) during construction?",
         "10% minimum", "25% minimum", "50% minimum", "100% of all alloy welds", "D",
         "API 578 Section 6.1 requires 100% PMI verification of all alloy welds and base materials in new construction to ensure correct alloy was used.",
         "PMI,API 578,alloy,new construction"),

        ("API 570", "5.6", "Vibration-Induced Fatigue", 2,
         "Piping subject to vibration-induced fatigue failure is most vulnerable at:",
         "Straight pipe sections between supports", "Midspan of long unsupported runs",
         "Small-bore connections and branch connections on vibrating lines", "Buried sections under roads", "C",
         "Vibration-induced fatigue most commonly causes failures at stress concentrations — small-bore connections (vent, drain, instrument taps) on vibrating main lines are the primary failure location.",
         "vibration,fatigue,small-bore,branch connections"),

        ("ASME B31.3", "331.1.3", "Hydrotest - Temperature", 2,
         "During a hydrostatic test per ASME B31.3, the minimum test temperature is important primarily to:",
         "Prevent excessive test pressure from temperature effects",
         "Avoid brittle fracture of carbon steel at low temperatures",
         "Ensure accurate pressure gauge readings",
         "Prevent cavitation in the test pump", "B",
         "ASME B31.3 requires minimum metal temperature during hydrostatic test to be above the nil ductility transition temperature to prevent brittle fracture. For carbon steel, typically 60°F (16°C) minimum.",
         "hydrotest,temperature,brittle fracture,ASME B31.3"),

        ("API 571", "3.4", "Chloride Stress Corrosion Cracking", 2,
         "Chloride Stress Corrosion Cracking (Cl-SCC) primarily affects which material?",
         "Carbon steel in any chloride environment",
         "Austenitic stainless steel under tensile stress with chlorides above ~140°F",
         "Duplex stainless steel above 600°F",
         "Copper-nickel alloys in seawater", "B",
         "Cl-SCC affects austenitic stainless steels (300 series) in the presence of chlorides, tensile stress, and temperatures typically above 140°F (60°C). It presents as transgranular cracking.",
         "Cl-SCC,chloride,stainless steel,stress corrosion cracking"),

        ("API 570", "7.6", "Internal Inspection", 2,
         "For process piping, internal visual inspection (IVI) is typically performed:",
         "On all piping annually", "Only when thickness measurements are insufficient",
         "During planned shutdowns when piping can be opened and entered or inspected with tools",
         "By robotic crawler only", "C",
         "IVI of process piping is typically performed during planned shutdowns or turnarounds when piping can be isolated, depressured, purged, and opened for inspection with visual tools or cameras.",
         "internal inspection,IVI,shutdown,turnaround"),

        ("API 574", "5.1", "Piping Components - Flanges", 1,
         "Per API 574, the raised face (RF) flange facing type is typically used in which service?",
         "Below -20°F cryogenic service", "General process service up to Class 2500",
         "High-pressure steam above 2500 psi only", "Vacuum service only", "B",
         "Raised face (RF) flanges are the most common flange face type for general process service across all pressure classes (150 through 2500). Ring Type Joint (RTJ) is used for high-pressure, high-temperature, or lethal service.",
         "flanges,raised face,API 574,flange facing"),

        ("API 574", "7.2", "Gasket Selection", 2,
         "Which gasket type is recommended for high-pressure, high-temperature hydrocarbon service in Ring Type Joint (RTJ) flanges?",
         "Full-face rubber gasket", "Spiral wound with graphite filler",
         "Solid metal ring (oval or octagonal)", "PTFE envelope gasket", "C",
         "RTJ flanges use solid metal ring gaskets (oval or octagonal cross-section) which are suitable for high-pressure, high-temperature service. They seat in a groove machined into the flange face.",
         "RTJ,ring type joint,gasket,high pressure,flanges"),

        ("API 570", "6.6", "Fitness for Service - Pitting", 3,
         "When evaluating isolated pitting corrosion per API 579 Level 1, the critical parameter is:",
         "Average pit depth across the entire circuit",
         "Maximum pit depth compared to minimum required thickness",
         "Number of pits per square foot of pipe surface",
         "Pit width-to-depth ratio only", "B",
         "API 579 Level 1 pitting assessment compares the maximum pit depth to the minimum required wall thickness (t_min). If (t_current - pit depth) ≥ t_min, the component passes Level 1 FFS.",
         "pitting,fitness for service,API 579,FFS,Level 1"),

        ("API 571", "3.5", "Carbonate Cracking", 2,
         "Carbonate Stress Corrosion Cracking in FCC units primarily affects:",
         "High-strength alloy steel piping", "Carbon steel in carbonate-containing process streams",
         "Copper alloy heat exchangers", "Titanium equipment in seawater", "B",
         "Carbonate SCC affects carbon steel in environments containing carbonate/bicarbonate ions, typically in FCC unit fractionator overhead systems. Stress relieving (PWHT) is the primary prevention measure.",
         "carbonate cracking,SCC,FCC,carbon steel,PWHT"),

        ("API 570", "7.7", "Cathodic Protection", 2,
         "For buried piping with cathodic protection, API 570 requires inspection of:",
         "The buried piping thickness only", "The cathodic protection system effectiveness",
         "Both the cathodic protection system and any areas of CP deficiency",
         "Only the coating integrity", "C",
         "API 570 requires inspection of both the cathodic protection system operation/effectiveness AND the buried piping, particularly at areas where CP may be deficient (coating holidays, shielding, interference).",
         "cathodic protection,buried piping,CP,external corrosion"),

        ("ASME B16.5", "2.1", "Flange Ratings - Temperature Effect", 3,
         "A Class 300 carbon steel (Group 1.1) flange has a pressure rating of 740 psig at 100°F. At 400°F, the pressure rating is approximately:",
         "740 psig (no change)", "680 psig", "595 psig", "500 psig", "C",
         "ASME B16.5 flange ratings decrease with temperature. Group 1.1 (A105/A216 WCB) Class 300 drops from 740 psi at 100°F to approximately 595 psi at 400°F per the rating tables. Always consult B16.5 tables for exact values.",
         "flange rating,temperature,ASME B16.5,pressure class"),

        ("API 570", "11.1", "Inspector Qualifications", 1,
         "The Authorized Piping Inspector (API 570) certification requires the inspector to be employed by:",
         "Only the owner/operator of the piping system",
         "An authorized inspection agency, the owner/operator, or an engineering organization",
         "Only an authorized inspection agency (third-party)",
         "Only the original equipment manufacturer", "B",
         "API 570 Section 11.1 defines Authorized Piping Inspectors as those employed by an authorized inspection agency, the owner/operator, or an engineering organization, all having appropriate qualifications and experience.",
         "inspector qualifications,API 570,authorized inspector"),

        ("API 571", "3.6", "Microbiologically Influenced Corrosion", 2,
         "Microbiologically Influenced Corrosion (MIC) is most commonly found in:",
         "High-temperature process streams above 300°F",
         "Stagnant or low-flow areas with biological activity (dead legs, cooling water)",
         "High-velocity single-phase hydrocarbon service",
         "Cryogenic service below -20°F", "B",
         "MIC requires biological activity (bacteria, fungi) which thrives in stagnant water environments. Common locations include dead legs, cooling water systems, ballast water, and low-flow areas.",
         "MIC,microbiological,bacteria,dead legs,cooling water"),

        ("API 570", "5.7", "Winterization and Freeze Protection", 1,
         "Piping used for winterization tracing and freeze protection systems should be:",
         "Excluded from API 570 inspection programs",
         "Inspected only after freeze events occur",
         "Included in the piping inspection program as Class 2 or Class 3",
         "Replaced annually as a preventive measure", "C",
         "Winterization and freeze protection piping should be included in the inspection program. Classification depends on the service — steam tracing, heat transfer fluid, or other services are classified by their own characteristics.",
         "winterization,freeze protection,inspection classification"),

        ("API 574", "6.1", "Pipe Support Inspection", 2,
         "When inspecting pipe supports, which condition is most concerning from a corrosion perspective?",
         "Supports painted with standard industrial paint",
         "Pipe resting on concrete saddles",
         "Pipe resting on steel cradle supports with trapped water at the contact point",
         "Supports with spring hangers", "C",
         "Contact point corrosion (also called 'crevice corrosion under support') occurs where pipe rests on steel supports, trapping water and creating oxygen concentration cells. This is often a CUI risk zone.",
         "pipe support,contact corrosion,CUI,crevice corrosion"),

        ("API 570", "8.3", "High-Energy Piping Inspection", 3,
         "For high-energy piping (steam/condensate at high temperature and pressure), creep damage is a concern primarily when metal temperature exceeds:",
         "200°F (93°C)", "400°F (204°C)", "750°F (400°C)", "1000°F (538°C)", "C",
         "Creep damage (time-dependent deformation and cracking at elevated temperature) becomes a significant concern for carbon steel above approximately 750°F (400°C). Above this temperature, stress rupture and creep void formation can occur.",
         "creep,high-energy piping,elevated temperature,carbon steel"),

        ("ASME B31.3", "314.2", "Branch Connections - Reinforcement", 3,
         "Per ASME B31.3, a branch connection in a pressure-containing pipe requires reinforcement when:",
         "The branch diameter is more than 1 inch",
         "Material is removed from the run pipe that exceeds what is replaced by the branch fitting",
         "The branch is on the bottom of the header",
         "The branch-to-header ratio exceeds 0.25", "B",
         "ASME B31.3 requires reinforcement analysis for branch connections where the area removed (the hole in the run pipe) exceeds the area of metal naturally available from the pipe and branch walls to compensate.",
         "branch connection,reinforcement,ASME B31.3,pressure design"),

        ("API 570", "9.2", "Weld Repairs - Requirements", 2,
         "A weld repair on in-service piping per API 570 must be performed by:",
         "Any qualified welder using any consumable",
         "A certified welder using a qualified welding procedure that meets the applicable code",
         "Only the original fabricator of the piping",
         "A welder who has passed the API 570 examination", "B",
         "API 570 Section 9.2 requires weld repairs to be performed by qualified welders using qualified welding procedures per the applicable code (ASME B31.3 or equivalent).",
         "weld repair,qualified welder,welding procedure,API 570"),

        ("API 571", "3.7", "Naphthenic Acid Corrosion", 3,
         "Naphthenic Acid Corrosion (NAC) in crude oil distillation is characterized by:",
         "Uniform corrosion at low temperatures", "Pitting corrosion in stagnant areas",
         "Localized erosion-corrosion at high-velocity zones in high-acid crude at >450°F",
         "Intergranular attack on stainless steel welds", "C",
         "NAC occurs in crude distillation units processing high Total Acid Number (TAN) crudes above ~450°F. It is erosion-corrosion driven by high velocity and acid concentration, appearing as gouging and streamlining at elbows and welds.",
         "naphthenic acid,NAC,TAN,crude distillation,erosion corrosion"),

        ("API 574", "8.1", "Valves - Inspection", 2,
         "Which of the following valve types is most susceptible to stem packing leakage in cycling service?",
         "Check valves", "Control valves with frequent cycling",
         "Gate valves in normally open position", "Ball valves in on/off service", "B",
         "Control valves with frequent cycling experience accelerated stem packing wear due to repeated movement, making them most susceptible to stem packing leakage compared to valves that are rarely operated.",
         "valves,stem packing,control valve,leakage"),

        ("API 570", "6.7", "Repair Records", 1,
         "After completing a repair on an API 570 piping circuit, the inspection record must document:",
         "Only the final thickness measurement after repair",
         "The repair method, materials, NDE results, PWHT if required, and inspector sign-off",
         "Only the cost of the repair for accounting purposes",
         "Only that the repair was completed", "B",
         "Complete repair documentation per API 570 includes: repair method and scope, materials of construction, applicable NDE results, PWHT records if required, pressure test results, and inspector certification of completion.",
         "repair records,documentation,inspection records,API 570"),

        ("API 570", "5.3", "Inspection Planning - Risk-Based", 2,
         "Risk-Based Inspection (RBI) methodology per API 580/581 evaluates:",
         "Only the probability of failure (POF)", "Only the consequence of failure (COF)",
         "Both probability of failure AND consequence of failure to prioritize inspection resources",
         "Inspection cost vs. replacement cost", "C",
         "RBI per API 580/581 is a risk-assessment process that combines Probability of Failure (POF) with Consequence of Failure (COF) to produce a risk ranking, which is then used to optimize inspection planning and resource allocation.",
         "RBI,risk-based inspection,API 580,probability,consequence"),

        ("API 574", "4.3", "Pipe Materials - High Temperature", 2,
         "For process piping operating above 850°F (455°C), which material consideration is most critical?",
         "Impact testing requirements", "Graphitization and/or creep damage potential",
         "Hydrogen embrittlement susceptibility", "Chloride stress corrosion cracking risk", "B",
         "Above approximately 850°F, carbon steel is susceptible to graphitization (decomposition of carbides) and enters the creep range. Alloy steels (1.25Cr-0.5Mo, 2.25Cr-1Mo) are used to resist these high-temperature damage mechanisms.",
         "high temperature,graphitization,creep,carbon steel,alloy steel"),

        ("API 570", "7.8", "Remaining Life - Half-life Rule", 3,
         "A 6-inch Schedule 40 carbon steel pipe carries a hydrocarbon service. Current wall = 0.395 in, t_min = 0.200 in, CR = 8 mpy. Next inspection interval based on API 570 half-life rule for Class 1:",
         "5.0 years", "12.2 years", "5 years (Class 1 max governs)", "6.1 years", "C",
         "RL = (0.395 - 0.200) / 0.008 = 24.4 years. Half-life = 12.2 years. But Class 1 max interval is 5 years. The minimum governs, so next inspection = 5 years (Class 1 maximum).",
         "remaining life,half-life rule,inspection interval,Class 1,calculation"),

        ("API 571", "5.1", "High-Temperature Oxidation", 2,
         "High-temperature oxidation (scaling) of carbon steel becomes significant above:",
         "400°F (204°C)", "600°F (316°C)", "1000°F (538°C)", "1200°F (649°C)", "C",
         "High-temperature oxidation (scaling) of carbon steel becomes significant above approximately 1000°F (538°C). Above this temperature, oxide scale forms rapidly and the steel loses section thickness at a meaningful rate.",
         "high temperature oxidation,scaling,carbon steel,temperature"),

        ("API 570", "10.3", "Alterations vs Repairs", 2,
         "Per API 570, what distinguishes an 'alteration' from a 'repair'?",
         "An alteration changes the pressure rating; a repair restores original condition",
         "A repair requires PWHT; an alteration does not",
         "An alteration is performed during shutdown; a repair can be done online",
         "There is no distinction — they are used interchangeably", "A",
         "API 570 distinguishes: a Repair restores piping to suitable condition per original design. An Alteration changes design conditions (pressure rating, temperature, service fluid) and requires recalculation and re-documentation.",
         "alteration,repair,API 570,definition"),

        ("ASME B31.3", "321.1.1", "Expansion - Flexibility", 2,
         "The purpose of providing flexibility in a piping system is to:",
         "Reduce pipe wall thickness requirements",
         "Allow for thermal expansion and contraction to prevent overstress",
         "Increase the allowable working pressure",
         "Reduce the required cathodic protection current", "B",
         "Thermal expansion flexibility (loops, offsets, expansion joints) prevents excessive stresses from temperature-induced expansion and contraction. ASME B31.3 Chapter II requirements ensure piping can thermally cycle without failing.",
         "thermal expansion,flexibility,pipe stress,ASME B31.3"),
    ]
}

pub fn get_seed_flashcards() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("Corrosion Rate", "Corrosion Rate Formula", "CR = (t_prev - t_current) / time_interval\nUnits: inches/year or mpy (mils/year)"),
        ("Remaining Life", "Remaining Life Formula", "RL = (t_current - t_min) / corrosion_rate\nMax next inspection = RL/2 (not to exceed class maximum)"),
        ("MAWP", "MAWP Formula (ASME B31.3)", "MAWP = 2SEt / (D - 2Yt)\nS=allowable stress, E=quality factor, t=thickness, D=OD, Y=temp coefficient"),
        ("Hydrotest Pressure", "Minimum Hydrotest Pressure", "P_test = 1.5 × MAWP\nFor most services per ASME B31.3"),
        ("Inspection Classes", "API 570 Piping Classes", "Class 1: Highest risk (flammable/toxic/high pressure) — 5 yr max\nClass 2: Moderate risk — 10 yr max\nClass 3: Lowest risk — 10 yr max"),
        ("CUI Temperature Range", "CUI Most Susceptible Temperature (Carbon Steel)", "10°F to 350°F (-12°C to 175°C)\nMoisture condenses and stays in contact with pipe surface"),
        ("Dead Legs", "Dead Leg Definition", "Sections of piping with little or no flow (stagnant)\nProne to: corrosion, MIC, pitting, water accumulation\nExamples: bypass lines, drains, vents, instrument connections"),
        ("HIC", "Hydrogen Induced Cracking", "Occurs in wet H2S service\nAtomic H diffuses into steel → recombines at inclusions → internal blisters/cracks\nPrevention: use HIC-resistant steel (low sulfur, Ca-treated)"),
        ("PWHT", "Post-Weld Heat Treatment Trigger (CS)", "Required for carbon steel (P1) weld repairs when thickness > 0.75 inches (19mm)\nReduces residual stress, improves toughness, prevents SSC"),
        ("SM-2 Algorithm", "Spaced Repetition SM-2 Quality Scale", "5: Perfect response\n4: Correct with slight hesitation\n3: Correct with difficulty\n2: Incorrect but easy answer recalled\n0: Complete blackout"),
        ("Injection Points", "Injection Point Inspection Zone", "Enhanced inspection within ±12 inches (300mm) of injection connection\nReason: localized corrosion, turbulence, erosion-corrosion"),
        ("CML", "Condition Monitoring Location", "Specific point where NDE thickness measurements are taken\nPriority: elbows, tees, injection points, dead legs, areas of known corrosion"),
        ("API 571 — SSC", "Sulfide Stress Cracking (SSC)", "Occurs in high-strength steels in H2S service\nHardness must be ≤ 22 HRC (NACE MR0175)\nPrevention: hardness control, use of resistant alloys"),
        ("B31.3 Wall Thickness", "ASME B31.3 Pressure Design Formula", "t = PD / 2(SEW + PY)\nP=pressure, D=OD, S=allowable stress, E=quality, W=weld joint, Y=temp coefficient"),
        ("API 578 — PMI", "Positive Material Identification", "Verification that correct alloy was used\nRequired for: new construction, repairs, alloy piping\nMethods: XRF, OES (optical emission spectrometry)"),
        ("Flange Ratings", "ASME B16.5 Pressure Classes", "Classes: 150, 300, 600, 900, 1500, 2500\nRating depends on: pressure class + temperature + material group"),
    ]
}

pub fn query_questions(conn: &Connection, filter: &QuestionFilter) -> SqlResult<Vec<Question>> {
    let limit = filter.limit.unwrap_or(20);
    let mut sql = String::from(
        "SELECT id, source_document, clause, topic, difficulty, question_text,
                option_a, option_b, option_c, option_d, correct_answer,
                explanation, ai_explanation, tags
         FROM questions WHERE 1=1"
    );

    if let Some(ref topic) = filter.topic {
        if !topic.is_empty() {
            sql.push_str(&format!(" AND topic = '{}'", topic.replace('\'', "''")));
        }
    }
    if let Some(diff) = filter.difficulty {
        sql.push_str(&format!(" AND difficulty = {}", diff));
    }
    if let Some(ref doc) = filter.source_document {
        if !doc.is_empty() {
            sql.push_str(&format!(" AND source_document = '{}'", doc.replace('\'', "''")));
        }
    }
    if filter.shuffle.unwrap_or(false) {
        sql.push_str(" ORDER BY RANDOM()");
    } else {
        sql.push_str(" ORDER BY difficulty, id");
    }
    sql.push_str(&format!(" LIMIT {}", limit));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| {
        Ok(Question {
            id: row.get(0)?,
            source_document: row.get(1)?,
            clause: row.get(2)?,
            topic: row.get(3)?,
            difficulty: row.get(4)?,
            question_text: row.get(5)?,
            option_a: row.get(6)?,
            option_b: row.get(7)?,
            option_c: row.get(8)?,
            option_d: row.get(9)?,
            correct_answer: row.get(10)?,
            explanation: row.get(11)?,
            ai_explanation: row.get(12)?,
            tags: row.get(13)?,
        })
    })?;
    rows.collect()
}
