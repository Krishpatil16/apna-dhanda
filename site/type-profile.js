/* Apna Dhanda v10.13.1 — shop-type profiles for the shopkeeper panel (/admin).
   ONE map decides, per shop type, the words ([hindi, english]), the navigation and the Today screen layout.
   Labels only: the stored order statuses (pending, accepted, …, delivered) and the DB schema are unchanged.
   family: kirana (grocery, the defaults) · food (restaurant) · service (salon, clinic, repair, other).
   Unknown types fall back to kirana. Loaded by admin.html before admin.js; tests load it in a VM. */
(function(root){
  const FAMILY_OF = {kirana:"kirana", restaurant:"food", salon:"service", clinic:"service", repair:"service", other:"service"};
  // shared grocery wording = exactly what the panel said before v10.13 (kirana is unchanged)
  const KIRANA = {
    nav: "tabs", // the bottom tab bar, as before (all 7 pages)
    tabs: ["today","orders","stock","products","categories","offers","reports","settings"],
    stock: true,
    words: {
      today_title: ["आज के ऑर्डर","Today's orders"], today_icon: "📋",
      orders_tab: ["ऑर्डर","Orders"], order: ["ऑर्डर","Order"], all_orders: ["सारे ऑर्डर","All orders"],
      empty_title: ["अभी कोई नया ऑर्डर नहीं","No new orders right now"], empty_sub: ["नया ऑर्डर आते ही यहाँ दिखेगा और घंटी बजेगी","New orders show up here with a ring"],
      kpi_active: ["नए / चालू","New / active"], kpi_done: ["पूरे हुए","Done"], kpi_sales: ["आज की बिक्री","Sales today"],
      new_toast: ["🔔 नया ऑर्डर आया!","🔔 New order!"],
      offers_empty: ["अभी कोई ऑफर नहीं। “नया ऑफर” से बनाएँ — जैसे “दाल पर 10% छूट” या “आटा 5 kg सिर्फ़ ₹229”।","No offers yet. Tap “New offer” — e.g. “10% off dal” or “Atta 5 kg only ₹229”."],
      offer_ph_hi: "दाल पर 10% छूट", offer_ph_en: "10% off dal",
      reject_reason: ["सामान ख़त्म है","Item out of stock"]
    },
    status: {} // no overrides: the classic order statuses
  };
  const FOOD = {
    nav: "tabs", tabs: KIRANA.tabs, stock: true,
    words: Object.assign({}, KIRANA.words, {
      offers_empty: ["अभी कोई ऑफर नहीं। “नया ऑफर” से बनाएँ — जैसे “थाली पर 10% छूट” या “2 समोसे सिर्फ़ ₹30”।","No offers yet. Tap “New offer” — e.g. “10% off thali” or “2 samosa only ₹30”."],
      offer_ph_hi: "थाली पर 10% छूट", offer_ph_en: "10% off thali",
      reject_reason: ["यह डिश अभी नहीं बन सकती","This dish is not available now"]
    }),
    status: {},
    // v10.15.3: a kitchen starts cooking, not packing (the rest of the order buttons are admin.js ACT)
    actions: {prep: ["बनाना शुरू करें","Start cooking"]}, action_icons: {prep: "🍳"}
  };
  const SERVICE = {
    nav: "pills", // no bottom bar: a 2×2 tile grid on the Today screen (Krish, 26 Oct 10:06 + 10:07 PM)
    pills: ["orders","products","reports"], // inner pages: "‹ Today" + the other pills
    grid: ["orders","products","reports","settings"], // Today: 2×2 compact tiles (Krish, 26 Oct 10:07 PM "Ye jaisa hai vaisa")
    tabs: ["today","orders","products","reports","settings"], // pages a salon can open; Offers/Categories stay reachable from Settings
    stock: false,
    words: {
      today_title: ["आज की अपॉइंटमेंट","Today's Appointments"], today_icon: "📅",
      orders_tab: ["अपॉइंटमेंट","Appointments"], order: ["ग्राहक","Customer"], all_orders: ["सारी अपॉइंटमेंट","All appointments"],
      empty_title: ["आज कोई अपॉइंटमेंट नहीं","No appointments today"], empty_sub: ["",""],
      kpi_next: ["अगली अपॉइंटमेंट","Next appointment"], kpi_revenue: ["आज की कमाई","Today's revenue"], kpi_waiting: ["इंतज़ार में","Waiting"], kpi_done: ["पूरे हुए","Completed"],
      kpi_booked: ["बुक","booked"], add_walkin: ["+ वॉक-इन जोड़ें","+ Add walk-in"],
      services: ["सेवाएँ","Services"], reports: ["रिपोर्ट","Reports"], settings: ["सेटिंग","Settings"], back_today: ["आज","Today"],
      more_tools: ["और","More"],
      new_toast: ["🔔 नई अपॉइंटमेंट आई!","🔔 New appointment!"],
      offers_empty: ["अभी कोई ऑफर नहीं। “नया ऑफर” से बनाएँ — जैसे “हेयरकट + दाढ़ी ₹199” या “फ़ेशियल पर 20% छूट”।","No offers yet. Tap “New offer” — e.g. “Haircut + beard ₹199” or “20% off facial”."],
      offer_ph_hi: "हेयरकट + दाढ़ी ₹199", offer_ph_en: "Haircut + beard ₹199",
      reject_reason: ["आज समय नहीं है","No slot available today"],
      search_ph: ["नाम, फ़ोन या नंबर","Name, phone or booking no."],
      pay_after: ["सेवा के बाद पैसे","Pay after the service"]
    },
    // label-only view of the EXISTING stored statuses
    status: {
      pending: ["इंतज़ार में","Waiting"], accepted: ["सेवा चालू","In Service"], preparing: ["सेवा चालू","In Service"], ready: ["सेवा चालू","In Service"],
      out_for_delivery: ["सेवा चालू","In Service"], delivered: ["पूरा हुआ","Completed"], rejected: ["रद्द","Cancelled"], cancelled: ["रद्द","Cancelled"]
    },
    // the next step buttons: Waiting → ✂️ Start service (accepted) → ✔️ Complete (delivered)
    next: {pending: [["accepted","✂️","btn-primary","start"]], accepted: [["delivered","✔️","btn-primary","complete"]], preparing: [["delivered","✔️","btn-primary","complete"]], ready: [["delivered","✔️","btn-primary","complete"]], out_for_delivery: [["delivered","✔️","btn-primary","complete"]]},
    actions: {start: ["सेवा शुरू","Start service"], complete: ["पूरा करें","Complete"]}
  };
  const BY_FAMILY = {kirana: KIRANA, food: FOOD, service: SERVICE};
  const familyOf = t => FAMILY_OF[Object.prototype.hasOwnProperty.call(FAMILY_OF, t) ? t : "kirana"];
  const TYPE_PROFILE = {};
  for (const t of Object.keys(FAMILY_OF)) TYPE_PROFILE[t] = Object.assign({type: t, family: familyOf(t)}, BY_FAMILY[familyOf(t)]);
  const profileFor = t => TYPE_PROFILE[Object.prototype.hasOwnProperty.call(TYPE_PROFILE, t) ? t : "kirana"];
  // v10.13.1: the salon's one-tap suggestions (Services page) = the services a NEW salon starts with, unpriced (Krish 11:04 PM: the price is the shopkeeper's).
  // min = hidden minutes for the token wait estimate only (Krish 11:07 PM "Time hata do"). Server: SALON_DEFAULTS in _worker.mjs, kept equal by a test.
  const SALON_DEFAULTS = [
    {icon: "✂️", hi: "हेयर कट", en: "Haircut", min: 20},
    {icon: "🧔", hi: "दाढ़ी ट्रिम", en: "Beard trim", min: 15},
    {icon: "🪒", hi: "शेव", en: "Shave", min: 15},
    {icon: "🎨", hi: "हेयर कलर", en: "Hair colour", min: 45},
    {icon: "🧖", hi: "फ़ेशियल", en: "Facial", min: 30},
    {icon: "💆", hi: "हेड मसाज", en: "Head massage", min: 15}
  ];
  root.AK_PROFILE = {TYPE_PROFILE, profileFor, familyOf, SALON_DEFAULTS};
})(typeof window !== "undefined" ? window : globalThis);
