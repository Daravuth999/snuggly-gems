export type Cue = {
  id: number;
  start: number;
  end: number;
  text: string;
};

// Transcript of the ferry scene, used as the shadowing teleprompter script.
export const cues: Cue[] = [
  { id: 1, start: 0.0, end: 2.15, text: "To get to Hey-Zoos's hideout," },
  { id: 2, start: 2.15, end: 4.36, text: "you got to take a ferry." },
  { id: 3, start: 4.36, end: 6.12, text: "Just let me handle the locals." },
  { id: 4, start: 6.12, end: 8.7, text: "Water folk tend to be a little standoffish around landies." },
  { id: 5, start: 8.7, end: 11.04, text: "Well, I've been hustling the streets since I was 12." },
  { id: 6, start: 11.04, end: 13.24, text: "Think I can handle a juggling seal." },
  { id: 7, start: 13.24, end: 15.08, text: "Sea lion." },
  { id: 8, start: 15.08, end: 16.74, text: "He's not from around here." },
  { id: 9, start: 16.74, end: 18.04, text: "But coin's coin." },
  { id: 10, start: 18.04, end: 22.46, text: "Oh, no, change is a choking hazard." },
  { id: 11, start: 22.46, end: 24.24, text: "Well, honest mistake." },
  { id: 12, start: 24.7, end: 26.78, text: "Do not do that!" },
  { id: 13, start: 26.78, end: 29.48, text: "Let Fled Nevel handle this. Thank you, Judith." },
  { id: 14, start: 29.48, end: 31.7, text: "Conversing with these beautiful sea creatures" },
  { id: 15, start: 31.7, end: 34.36, text: "is like talking to anyone a little different." },
  { id: 16, start: 34.36, end: 36.78, text: "Just takes open and respectful" },
  { id: 17, start: 36.78, end: 39.0, text: "communication." },
  { id: 18, start: 55.0, end: 56.36, text: "Seen Jesus?" },
  { id: 19, start: 56.36, end: 57.56, text: "Yup." },
  { id: 20, start: 65.3, end: 67.38, text: "And now, we leave town." },
];

// Words and chunks students should notice while shadowing.
export const keyLanguage: string[] = [
  "got to take",
  "handle the locals",
  "tend to be",
  "standoffish",
  "hustling the streets",
  "not from around here",
  "choking hazard",
  "honest mistake",
  "Conversing with",
  "is like talking to",
  "Just takes",
  "open and respectful",
];
