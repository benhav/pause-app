export type Locale = "en" | "no";

export const UI_TEXT = {

  en: {

    subtitle: "No expectations.",
    justForTodayA: "Just for today.",
    justForTodayB: "You don't need to explain anything.",

    begin: "Begin",
    today: "Today",

    qCapacity: "How is your capacity right now?",
    qLoad: "What feels heaviest?",
    qBoundary: "Is there anything you should not push today?",

    optional: "Optional. A few words is enough.",

    done: "Done",
    close: "Close",
    goBack: "Go back",

    gentleLabel: "One gentle suggestion",
    doNotPushLabel: "Do not push",

    boundaryPlaceholder:
      "e.g. calls, decisions, social plans…",

    phaseLine:
      "Phase 1 prototype • no account • no tracking",

    clearData:
      "Clear saved data on this device",

    appNameLine:
      "Pause - No expectations",

    langEN: "English",
    langNO: "Norsk",

    anythingExtra: "Anything extra.",

    nothingAddedHint:
      "Nothing added today — that's okay.",

    breathingRoom: "Breathing room",
    breathingRoomTitle: "Breathing room",

    hideElements: "Hide elements",
    showElements: "Show elements",

    speedAria: "Adjust speed",
    resetSpeed: "Reset",

    openBreathingRoom:
      "Open breathing room",

    followRhythm:
      "Follow the rhythm",

    // ---------- THEME (EN) ----------

    themeTitle: "Theme",

    themeClassic:
      "Classic (Free)",

    themeFloating:
      "Floating (Pro)",

    themeNature:
      "Nature (Pro)",

    themeNightpro:
      "Night Pro (Pro)",

    themeNightproNote:
      "(always dark)",

    themeProLocked:
      "This is a Pro feature.",

    themeActivateProDemo:
      "Activate pro-demo",

    themeDeactivateProDemo:
      "Deactivate pro-demo",

    capacityOptions: {

      "Very low": "Very low",
      Low: "Low",
      Some: "Some",

    },

    loadOptions: {

      "Mind racing": "Mind racing",
      "Body heavy": "Body heavy",
      Expectations: "Expectations",
      "Brain Fog": "Brain Fog",
      "Everything feels heavy":
        "Everything feels heavy",
      "I feel a little okay today":
        "I feel a little okay today",

    },

  },

  no: {

    subtitle:
      "Ingen forventninger.",

    justForTodayA:
      "Kun her og nå.",

    justForTodayB:
      "Du trenger ikke forklare noe.",

    begin: "Start",
    today: "I dag",

    qCapacity:
      "Hvordan er kapasiteten din akkurat nå?",

    qLoad:
      "Hva kjennes tyngst?",

    qBoundary:
      "Er det noe du ikke bør presse i dag?",

    optional:
      "Valgfritt. Noen få ord holder.",

    done: "Ferdig",
    close: "Lukk",
    goBack: "Tilbake",

    gentleLabel:
      "Et vennlig forslag",

    doNotPushLabel:
      "Ikke stress med",

    boundaryPlaceholder:
      "f.eks. samtaler, beslutninger, sosiale planer…",

    phaseLine:
      "Fase 1 prototype • ingen konto • ingen sporing",

    clearData:
      "Slett lagrede data på denne enheten",

    appNameLine:
      "Pause - Ingen forventninger",

    langEN: "English",
    langNO: "Norsk",

    anythingExtra:
      "Noe som helst annet.",

    nothingAddedHint:
      "Ingenting lagt til i dag — det er helt greit.",

    breathingRoom:
      "Pusterom",

    breathingRoomTitle:
      "Pusterom",

    hideElements:
      "Skjul elementer",

    showElements:
      "Vis elementer",

    speedAria:
      "Juster tempo",

    resetSpeed:
      "Nullstill",

    openBreathingRoom:
      "Åpne pusterom",

    followRhythm:
      "Følg rytmen",

    // ---------- THEME (NO) ----------

    themeTitle: "Tema",

    themeClassic:
      "Classic (Gratis)",

    themeFloating:
      "Floating (Pro)",

    themeNature:
      "Nature (Pro)",

    themeNightpro:
      "Night Pro (Pro)",

    themeNightproNote:
      "(alltid nattmodus)",

    themeProLocked:
      "Dette er en Pro-funksjon.",

    themeActivateProDemo:
      "Aktiver pro-demo",

    themeDeactivateProDemo:
      "Deaktiver pro-demo",

    capacityOptions: {

      "Very low": "Svært lav",
      Low: "Lav",
      Some: "Noe",

    },

    loadOptions: {

      "Mind racing": "Tankekjør",
      "Body heavy": "Tung i kroppen",
      Expectations: "Forventninger",
      "Brain Fog": "Hjernetåke",
      "Everything feels heavy":
        "Alt føles tungt",
      "I feel a little okay today":
        "Jeg føler meg litt ok i dag",

    },

  },

} as const;