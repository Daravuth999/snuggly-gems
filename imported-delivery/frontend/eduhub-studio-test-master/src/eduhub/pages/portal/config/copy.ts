import type { Lang } from "../types";

/**
 * Bilingual copy. Use the `t(key, lang)` helper or directly index COPY[key][lang].
 * Keep keys flat and stable — they are referenced across components.
 */
export const COPY = {
  // ----- Brand / shell
  brandName: { en: "Student Portal", km: "ផ្ទាំងសិស្ស" },
  brandTag: { en: "Indigo Education · 2026", km: "Indigo Education · ២០២៦" },
  signIn: { en: "Sign in to view your evaluation", km: "ចូលដើម្បីមើលលទ្ធផល" },
  signInLong: {
    en: "Sign in to view your monthly evaluation, points, and teacher feedback.",
    km: "ចូលគណនីដើម្បីមើលលទ្ធផលប្រចាំខែ, ពិន្ទុ, និងមតិពីគ្រូ។",
  },

  // ----- Login form
  studentId: { en: "Student ID", km: "លេខសម្គាល់សិស្ស" },
  password: { en: "Password", km: "ពាក្យសម្ងាត់" },
  hint: { en: "Hint", km: "ជួយជំនួយ" },
  enterIdFirst: {
    en: "Please enter your Student ID first to get a hint.",
    km: "សូមបញ្ចូលលេខសម្គាល់សិស្សមុនដើម្បីទទួលបានជំនួយ។",
  },
  enterBoth: {
    en: "Please enter both Student ID and Password.",
    km: "សូមបញ្ចូលទាំងលេខសម្គាល់និងពាក្យសម្ងាត់។",
  },
  studentNotFound: {
    en: "Student not found. Check your ID and try again.",
    km: "រកមិនឃើញសិស្ស។ សូមពិនិត្យលេខសម្គាល់ម្តងទៀត។",
  },
  wrongPassword: {
    en: "Incorrect password. Please try again.",
    km: "ពាក្យសម្ងាត់មិនត្រឹមត្រូវ។ សូមព្យាយាមម្តងទៀត។",
  },
  loginGenericError: {
    en: "Login failed. Please verify your credentials and try again.",
    km: "ការចូលបរាជ័យ។ សូមពិនិត្យអត្តសញ្ញាណរបស់អ្នកម្តងទៀត។",
  },
  signInBtn: { en: "Sign In", km: "ចូលគណនី" },
  signingIn: { en: "Signing in…", km: "កំពុងចូល…" },
  noHint: { en: "No hint available.", km: "មិនមានជំនួយ។" },
  hintFetchError: {
    en: "Could not fetch hint. Check your connection.",
    km: "មិនអាចទាញជំនួយបាន។ សូមពិនិត្យបណ្ដាញ។",
  },
  forgotPasswordPrompt: { en: "Forgot your password?", km: "ភ្លេចពាក្យសម្ងាត់?" },
  enterIdForReset: {
    en: "Please enter your Student ID first.",
    km: "សូមបញ្ចូលលេខសម្គាល់សិស្សមុនសិន។",
  },
  forgotPasswordLink: {
    en: "Ask your teacher to reset it",
    km: "សុំគ្រូជួយកំណត់ពាក្យសម្ងាត់ឡើងវិញ",
  },
  forgotPasswordSending: { en: "Sending…", km: "កំពុងផ្ញើ…" },
  forgotPasswordSent: {
    en: "If this ID is registered, your teacher has been notified.",
    km: "ប្រសិនបើលេខសម្គាល់នេះមានចុះឈ្មោះ គ្រូរបស់អ្នកនឹងទទួលបានការជូនដំណឹង។",
  },
  forgotPasswordGenericError: {
    en: "Request failed. Please try again.",
    km: "ការស្នើសុំបរាជ័យ។ សូមព្យាយាមម្តងទៀត។",
  },

  // ----- Top bar
  scoreGuide: { en: "Score Guide", km: "មគ្គុទ្ទេសក៏ពិន្ទុ" },
  print: { en: "Print", km: "បោះពុម្ព" },
  logout: { en: "Sign Out", km: "ចេញគណនី" },
  language: { en: "ភាសា", km: "Language" }, // Always shown in the OTHER language

  // ----- Student header
  pointsBalance: { en: "Points Balance", km: "ពិន្ទុបច្ចុប្បន្ន" },
  send: { en: "Send", km: "ផ្ញើ" },
  pointsReceivedFromTpl: {
    en: "{from} just sent you {amount} ✨",
    km: "{from} ផ្ញើពិន្ទុ {amount} មកអ្នក ✨",
  },
  pointsReceivedTpl: {
    en: "You received {amount} ✨",
    km: "អ្នកបានទទួលពិន្ទុ {amount} ✨",
  },
  /* Curiosity-driven anonymous-source variants — rotated randomly when the
     points came from a teacher, game, or any non-transfer source.          */
  pointsAnon1: {
    en: "+{amount} ✨ Teacher reward!",
    km: "+{amount} ✨ គ្រូផ្តល់រង្វាន់!",
  },
  pointsAnon2: {
    en: "+{amount} 🎁 Surprise points!",
    km: "+{amount} 🎁 ពិន្ទុភ្ញាក់ផ្អើល!",
  },
  pointsAnon3: {
    en: "+{amount} 🎯 Game bonus!",
    km: "+{amount} 🎯 ប្រាក់រង្វាន់ហ្គេម!",
  },
  pointsAnon4: {
    en: "+{amount} 🌟 Bonus boost!",
    km: "+{amount} 🌟 ការបន្ថែមពិសេស!",
  },
  pointsAnon5: {
    en: "+{amount} 🚀 You earned it!",
    km: "+{amount} 🚀 អ្នកសមនឹងទទួលបាន!",
  },
  /* "Huge" tier copy — used for dramatic full-screen celebration */
  pointsHugeTitle: {
    en: "Massive boost! +{amount}",
    km: "ការកើនឡើងធំ! +{amount}",
  },
  pointsHugeSub: {
    en: "Something amazing just happened ✨",
    km: "មានរឿងអស្ចារ្យបានកើតឡើង ✨",
  },
  /* Welcome-back: change accumulated between sessions. */
  pointsWelcomeBackTpl: {
    en: "+{amount} ✨ earned while you were away",
    km: "+{amount} ✨ ទទួលបានពេលអ្នកមិននៅ",
  },
  pointsWelcomeBackTitle: {
    en: "Welcome back! +{amount}",
    km: "សូមស្វាគមន៍ត្រឡប់មកវិញ! +{amount}",
  },
  pointsWelcomeBackSub: {
    en: "You picked up points while you were gone ✨",
    km: "អ្នកទទួលបានពិន្ទុបន្ថែមពេលអ្នកមិននៅ ✨",
  },
  /* LatestRewardCard copy */
  rewardsLabel: { en: "Rewards", km: "រង្វាន់" },
  noRewardYet: {
    en: "Your next reward will appear here ✨",
    km: "រង្វាន់បន្ទាប់នឹងបង្ហាញនៅទីនេះ ✨",
  },
  rewardSourceTeacher: { en: "Teacher reward", km: "រង្វាន់ពីគ្រូ" },
  rewardSourceSurprise: { en: "Surprise points", km: "ពិន្ទុភ្ញាក់ផ្អើល" },
  rewardSourceGame: { en: "Game bonus", km: "ប្រាក់រង្វាន់ហ្គេម" },
  rewardSourceBoost: { en: "Bonus boost", km: "ការបន្ថែមពិសេស" },
  rewardSourceEarned: { en: "You earned it", km: "អ្នកសមនឹងទទួលបាន" },
  rewardSourceWhileAway: {
    en: "Earned while you were away",
    km: "ទទួលបានពេលអ្នកមិននៅ",
  },
  topPerformerToast: {
    en: "🏆 You hit Top Performer status!",
    km: "🏆 អ្នកឡើងដល់កម្រិតលេចធ្លោ!",
  },
  topPerformerSub: {
    en: "Overall score crossed 8.5 — outstanding work.",
    km: "ពិន្ទុសរុបឡើងដល់ ៨.៥ — សមត្ថភាពល្អណាស់!",
  },
  improvedPill: { en: "Improved", km: "កើនឡើង" },
  excellentStreakTpl: {
    en: "🔥 {n}-month excellent streak",
    km: "🔥 ល្អឥតខ្ចោះ {n} ខែ​ជាប់ៗ",
  },
  newPill: { en: "NEW", km: "ថ្មី" },
  welcome: {
    en: "Welcome back to your dashboard.",
    km: "សូមស្វាគមន៍មកកាន់ផ្ទាំងគ្រប់គ្រងសិស្ស",
  },

  // ----- Tuition / payment
  tuitionPaid: { en: "Tuition: Paid", km: "ថ្លៃសិក្សា៖ បានបង់" },
  tuitionPending: { en: "Tuition: Pending", km: "ថ្លៃសិក្សា៖ កំពុងរង់ចាំ" },
  tuitionUnpaid: { en: "Tuition: Unpaid", km: "ថ្លៃសិក្សា៖ មិនទាន់បង់" },
  daysUntilTuition: {
    en: "days until next tuition",
    km: "ថ្ងៃទៀតដល់ការបង់ថ្លៃសិក្សា",
  },
  daysHeadsUp: { en: "days · plan ahead", km: "ថ្ងៃ · ត្រៀមខ្លួន" },
  duePrefix: { en: "Due", km: "ត្រូវបង់ថ្ងៃទី" },
  lastPaid: { en: "Last paid", km: "បានបង់ចុងក្រោយ" },
  paymentDueSoon: { en: "Payment Due Soon", km: "ថ្ងៃផុតកំណត់ខិតមកដល់" },
  tuitionOverdue: { en: "Tuition Overdue", km: "ថ្លៃសិក្សាហួសកាលកំណត់" },

  // ----- Coupon
  haveCoupon: { en: "Have a coupon?", km: "មានកូដបញ្ចុះតម្លៃ?" },
  enterCode: { en: "ENTER CODE", km: "បញ្ចូលកូដ" },
  apply: { en: "Apply", km: "យកមកប្រើ" },
  checking: { en: "Checking…", km: "កំពុងពិនិត្យ…" },
  couponInvalid: {
    en: "Invalid coupon code.",
    km: "កូដបញ្ចុះតម្លៃមិនត្រឹមត្រូវ។",
  },
  couponNetworkError: {
    en: "Could not validate coupon. Try again.",
    km: "មិនអាចពិនិត្យបាន។ ព្យាយាមម្តងទៀត។",
  },

  // ----- Sections / dashboard
  monthlyPerformance: { en: "Monthly Performance", km: "លទ្ធផលប្រចាំខែ" },
  perfByCriterion: {
    en: "Performance by Criterion",
    km: "លទ្ធផលតាមលក្ខណៈវិនិច្ឆ័យ",
  },
  overallScoreTitle: { en: "Overall Score", km: "ពិន្ទុសរុប" },
  teacherComments: { en: "Teacher Comments", km: "មតិយោបល់ពីគ្រូ" },
  history: { en: "Performance History", km: "ប្រវត្តិលទ្ធផល" },
  loadingComments: { en: "Loading comments…", km: "កំពុងទាញមតិ…" },
  loadingHistory: { en: "Loading history…", km: "កំពុងទាញប្រវត្តិ…" },
  noComments: {
    en: "No comments yet — your teacher will add some soon.",
    km: "មិនទាន់មានមតិ — គ្រូនឹងបន្ថែមឆាប់ៗ។",
  },
  noHistory: {
    en: "No history available yet.",
    km: "មិនទាន់មានប្រវត្តិ។",
  },
  overallExplain: {
    en: "Your overall score is the average of your six core criteria. Aim for 8.5+ to earn Top Performer status.",
    km: "ពិន្ទុសរុបគឺជាមធ្យមនៃលក្ខណៈវិនិច្ឆ័យទាំងប្រាំមួយ។ ខំប្រឹងឡើង ៨.៥ ដើម្បីក្លាយជាសិស្សលេចធ្លោ!",
  },
  outOfTen: { en: "of 10", km: "ក្នុងចំនួន ១០" },

  // ----- "Why is my score this?" drawer
  whyThisScore: { en: "About this score", km: "អំពីពិន្ទុនេះ" },
  closeBtn: { en: "Close", km: "បិទ" },

  // ----- Send-points modal
  sendPoints: { en: "Send Points", km: "ផ្ទេរពិន្ទុ" },
  yourBalance: { en: "Your Balance", km: "ពិន្ទុរបស់អ្នក" },
  receiverId: { en: "Receiver Student ID", km: "លេខសម្គាល់អ្នកទទួល" },
  amount: { en: "Amount", km: "ចំនួន" },
  sending: { en: "Sending…", km: "កំពុងផ្ញើ…" },
  recentTransfers: { en: "Recent Transfers", km: "ការផ្ទេរថ្មីៗ" },
  noTransfers: { en: "No recent transfers.", km: "មិនមានការផ្ទេរថ្មីៗ។" },
  enterValidReceiver: {
    en: "Enter a valid receiver Student ID.",
    km: "សូមបញ្ចូលលេខសម្គាល់អ្នកទទួលត្រឹមត្រូវ។",
  },
  amountMustBePositive: {
    en: "Amount must be a positive number.",
    km: "ចំនួនត្រូវតែជាលេខវិជ្ជមាន។",
  },
  notEnoughPoints: {
    en: "You don't have enough points.",
    km: "អ្នកមិនមានពិន្ទុគ្រប់គ្រាន់ទេ។",
  },
  transferOk: {
    en: "Successfully sent {amount} points to {to}.",
    km: "ផ្ទេរ {amount} ពិន្ទុទៅ {to} បានជោគជ័យ។",
  },
  transferFail: { en: "Transfer failed.", km: "ការផ្ទេរបរាជ័យ។" },
  networkError: { en: "Network error. Please try again.", km: "បញ្ហាបណ្ដាញ។" },
  confirmTransfer: { en: "Confirm Transfer", km: "បញ្ជាក់ការផ្ទេរ" },
  youAreSending: { en: "You are sending", km: "អ្នកកំពុងផ្ញើ" },
  balanceAfter: { en: "Your balance after", km: "សមតុល្យបន្ទាប់" },
  sentSuccess: { en: "Sent!", km: "បានផ្ញើ!" },
  transferIdLabel: { en: "Transfer ID", km: "លេខផ្ទេរ" },
  fromLabel: { en: "From", km: "ពី" },
  toLabel: { en: "To", km: "ទៅ" },
  newBalanceLabel: { en: "New Balance", km: "សមតុល្យថ្មី" },
  receiverNotFound: {
    en: "Student ID not found. Check the ID and try again.",
    km: "រកមិនឃើញសិស្សនេះ។ សូមពិនិត្យ ID ម្ដងទៀត។",
  },

  // ----- Restriction modal
  accessRevoked: { en: "Access Revoked", km: "ការចូលប្រើត្រូវបានដកយក" },
  signOutNow: { en: "Sign Out Now", km: "ចេញឥឡូវនេះ" },
  sessionEndingTpl: {
    en: "Your session will end in {n}…",
    km: "គណនីរបស់អ្នកនឹងបិទក្នុង {n} វិនាទី…",
  },

  // ----- Score guide modal
  scoreGuideAutoClose: {
    en: "This dialog auto-closes in 20 seconds.",
    km: "ប្រអប់នេះនឹងបិទដោយស្វ័យប្រវត្តិក្នុង ២០ វិនាទី។",
  },

  // ----- Connection banner
  connectionIssue: {
    en: "Connection issue — retrying…",
    km: "បញ្ហាបណ្ដាញ — កំពុងព្យាយាមម្ដងទៀត…",
  },
  retry: { en: "Retry now", km: "ព្យាយាមឥឡូវ" },

  // ----- Footer
  footer: {
    en: "© {year} Indigo Education · Student Evaluation Portal",
    km: "© {year} Indigo Education · ផ្ទាំងវាយតម្លៃសិស្ស",
  },

  // ----- Attendance v2 (AttendanceOverview.jsx) — natural Khmer, not
  // literal word-for-word translation. Reward NAME itself is never
  // translated here — it's whatever the admin configured in the real
  // Login Reward campaign, shown verbatim in both languages.
  attMonthStartsHere: { en: "Your attendance journey begins here", km: "ដំណើររៀនរបស់អ្នកចាប់ផ្តើមនៅទីនេះ" },
  attNoClassesRecorded: { en: "No classes recorded yet.", km: "មិនទាន់មានថ្នាក់ត្រូវបានកត់ត្រានៅឡើយទេ។" },
  attProgressWillAppear: {
    en: "Your first class will start building this month's progress.",
    km: "ថ្នាក់ដំបូងរបស់អ្នកនឹងចាប់ផ្តើមកសាងវឌ្ឍនភាពប្រចាំខែនេះ។",
  },
  attClassesCountTpl: { en: "{attended} of {total} eligible classes", km: "{attended} នៃ {total} ថ្នាក់ដែលមានសិទ្ធិរាប់" },
  attCycleStartedTpl: {
    en: "Your Attendance cycle started on {date}. Only classes from then on count toward this month's requirement.",
    km: "វដ្តវត្តមានរបស់អ្នកបានចាប់ផ្តើមនៅថ្ងៃទី {date}។ មានតែថ្នាក់ចាប់ពីពេលនោះទេដែលរាប់ចូលក្នុងតម្រូវការខែនេះ។",
  },
  attSessionUpdated: { en: "Updated", km: "បានកែប្រែ" },
  attRequirementMet: { en: "Requirement met", km: "បានបំពេញលក្ខខណ្ឌ" },
  attAlmostThere: { en: "Almost there", km: "ជិតដល់ហើយ" },
  attMonthlyGoal: { en: "Monthly goal", km: "គោលដៅប្រចាំខែ" },
  attRequiredPctTpl: { en: "{pct}% required", km: "តម្រូវការ {pct}%" },
  attAboveRequirement: { en: "You're above the requirement.", km: "អ្នកលើសពីលក្ខខណ្ឌតម្រូវ។" },
  attBelowRequirement: { en: "You're currently below the requirement.", km: "អ្នកកំពុងនៅក្រោមលក្ខខណ្ឌតម្រូវ។" },
  attKeepGoing: {
    en: "Attend your next class to keep moving toward your monthly goal.",
    km: "ចូលរៀនថ្នាក់បន្ទាប់ដើម្បីបន្តឆ្ពោះទៅរកគោលដៅប្រចាំខែរបស់អ្នក។",
  },
  attStartAttending: {
    en: "Start attending classes to work toward your monthly reward.",
    km: "ចាប់ផ្តើមចូលរៀនដើម្បីឆ្ពោះទៅរករង្វាន់ប្រចាំខែរបស់អ្នក។",
  },
  attYourAttendance: { en: "Your attendance", km: "វត្តមានរបស់អ្នក" },
  // Layer A (accumulated per-session points) — deliberately distinct
  // wording/placement from the Monthly Attendance Reward strings below
  // (Layer B), so the two are never read as the same thing.
  attPointsThisMonthTpl: {
    en: "Attendance Points · +{points} pts this month",
    km: "ពិន្ទុវត្តមាន · +{points} ពិន្ទុសម្រាប់ខែនេះ",
  },
  attPresent: { en: "Present", km: "មានវត្តមាន" },
  attLate: { en: "Late", km: "យឺត" },
  attAbsent: { en: "Absent", km: "អវត្តមាន" },
  attRecentClasses: { en: "Recent classes", km: "ថ្នាក់ថ្មីៗ" },
  attRecentSessions: { en: "Recent sessions", km: "ថ្នាក់ចូលរៀនថ្មីៗ" },
  attAttendanceHistory: { en: "Attendance history", km: "ប្រវត្តិវត្តមាន" },
  attEligible: { en: "Eligible", km: "មានសិទ្ធិ" },
  attNotEligible: { en: "Not eligible", km: "មិនទាន់មានសិទ្ធិ" },
  attHowItWorks: { en: "How it works", km: "របៀបដំណើរការ" },
  attHowItWorksSummary: {
    en: "Attend → Reach the monthly goal → Claim your reward",
    km: "ចូលរៀន → សម្រេចគោលដៅប្រចាំខែ → ទទួលរង្វាន់របស់អ្នក",
  },
  attStep1Title: { en: "Attend", km: "ចូលរៀន" },
  attStep1Body: {
    en: "Check in through EduHub when your teacher opens attendance.",
    km: "ចុះឈ្មោះតាមរយៈ EduHub នៅពេលគ្រូបើកការចុះវត្តមាន។",
  },
  attStep2Title: { en: "Reach the goal", km: "សម្រេចគោលដៅ" },
  attStep2Body: {
    en: "Keep your monthly attendance at or above the requirement.",
    km: "រក្សាវត្តមានប្រចាំខែឱ្យស្មើ ឬលើសពីលក្ខខណ្ឌតម្រូវ។",
  },
  attStep3Title: { en: "Claim", km: "ទទួលរង្វាន់" },
  attStep3Body: {
    en: "Your reward becomes available when you qualify.",
    km: "រង្វាន់របស់អ្នកនឹងអាចទទួលបាននៅពេលអ្នកមានលក្ខណៈសម្បត្តិគ្រប់គ្រាន់។",
  },
  attNextClass: { en: "Next class", km: "ថ្នាក់បន្ទាប់" },
  attGoToAttendance: { en: "Attendance", km: "វត្តមាន" },
  attMonthlyReward: { en: "Monthly Attendance Reward", km: "រង្វាន់វត្តមានប្រចាំខែ" },
  attRewardNotConfigured: {
    en: "No reward configured yet.",
    km: "រង្វាន់មិនទាន់ត្រូវបានកំណត់ទេ។",
  },
  attRewardLocked: {
    en: "Attend your classes this month to work toward your reward.",
    km: "ចូលរៀនក្នុងខែនេះដើម្បីឆ្ពោះទៅរករង្វាន់របស់អ្នក។",
  },
  attRewardInProgressTpl: {
    en: "You're currently at {pct}%. Reach {required}% to unlock your reward.",
    km: "អ្នកកំពុងនៅត្រឹម {pct}%។ សូមឈានដល់ {required}% ដើម្បីទទួលបានរង្វាន់។",
  },
  attRewardUnlockedNote: { en: "You've qualified for this month's reward.", km: "អ្នកមានលក្ខណៈសម្បត្តិគ្រប់គ្រាន់សម្រាប់រង្វាន់ប្រចាំខែនេះ។" },
  attClaimReward: { en: "Claim Reward", km: "ទទួលរង្វាន់" },
  attClaiming: { en: "Claiming…", km: "កំពុងទទួល…" },
  attClaimed: { en: "Reward claimed", km: "បានទទួលរង្វាន់" },
  attPointsAddedTpl: { en: "+{points} pts added to your account.", km: "ពិន្ទុ +{points} ត្រូវបានបញ្ចូលទៅគណនីរបស់អ្នក។" },
  attRewardUnavailable: {
    en: "Your attendance requirement is complete, but this reward is currently unavailable.",
    km: "អ្នកបានបំពេញលក្ខខណ្ឌវត្តមានរួចហើយ ប៉ុន្តែរង្វាន់នេះមិនទាន់អាចប្រើបានទេនាពេលនេះ។",
  },
  attErrorGeneric: { en: "Couldn't load your attendance summary.", km: "មិនអាចផ្ទុកសង្ខេបវត្តមានរបស់អ្នកបានទេ។" },
  attLiveNow: { en: "Class is live now", km: "ថ្នាក់កំពុងផ្សាយផ្ទាល់ឥឡូវនេះ" },
  attTapToCheckIn: { en: "Tap to check in", km: "ចុចដើម្បីចុះឈ្មោះចូលរៀន" },
  attDashboardLiveEyebrow: { en: "Attendance is live", km: "កំពុងចុះវត្តមាន" },
  attDashboardLiveBody: { en: "Your teacher has opened attendance.", km: "គ្រូរបស់អ្នកបានបើកការចុះវត្តមានហើយ។" },
  attCheckInBtn: { en: "Check in", km: "ចុះឈ្មោះចូលរៀន" },
  attUnlocked: { en: "Unlocked", km: "ដោះសោហើយ" },
  attGoalAboveTpl: { en: "You're {pct}% above", km: "អ្នកលើសពី {pct}%" },
  attGoalBelowTpl: { en: "{pct}% to go", km: "នៅសល់ {pct}%" },
  attGoalSatisfiedTpl: {
    en: "✓ Requirement satisfied for {month}",
    km: "✓ បានបំពេញលក្ខខណ្ឌសម្រាប់ {month}",
  },
  attAttendanceHistoryEmpty: {
    en: "Your monthly history will appear here.",
    km: "ប្រវត្តិប្រចាំខែរបស់អ្នកនឹងបង្ហាញនៅទីនេះ។",
  },
  attRewardAlmostThere: {
    en: "You're almost at your monthly goal.",
    km: "អ្នកជិតដល់គោលដៅប្រចាំខែរបស់អ្នកហើយ។",
  },
  attUnlockHintTpl: { en: "Reach {pct}% to unlock", km: "ឈានដល់ {pct}% ដើម្បីដោះសោ" },
  attCongrats: { en: "Congratulations!", km: "សូមអបអរសាទរ!" },
  attAddedToBalance: { en: "Added to your balance", km: "បានបញ្ចូលទៅក្នុងសមតុល្យរបស់អ្នក" },
  attViewMyPoints: { en: "View my points", km: "មើលពិន្ទុរបស់ខ្ញុំ" },
  attHowToUnlock: { en: "How your monthly reward works", km: "របៀបដែលរង្វាន់ប្រចាំខែរបស់អ្នកដំណើរការ" },
  attUnlockStep1Title: { en: "Check in", km: "ចុះឈ្មោះចូលរៀន" },
  attUnlockStep1Body: {
    en: "Your attendance is recorded automatically for each class.",
    km: "វត្តមានរបស់អ្នកត្រូវបានកត់ត្រាដោយស្វ័យប្រវត្តិសម្រាប់ថ្នាក់នីមួយៗ។",
  },
  attUnlockStep2Title: { en: "Your percentage is calculated", km: "ភាគរយរបស់អ្នកត្រូវបានគណនា" },
  attUnlockStep2Body: {
    en: "Only eligible classes in the current month are counted.",
    km: "មានតែថ្នាក់ដែលមានសិទ្ធិរាប់ក្នុងខែបច្ចុប្បន្នប៉ុណ្ណោះដែលត្រូវបានរាប់។",
  },
  attUnlockStep3Title: { en: "Reach the goal", km: "សម្រេចគោលដៅ" },
  attUnlockStep3Body: {
    en: "Meet the required attendance percentage.",
    km: "បំពេញភាគរយវត្តមានដែលបានតម្រូវ។",
  },
  attUnlockStep4Title: { en: "Claim your reward", km: "ទទួលរង្វាន់របស់អ្នក" },
  attUnlockStep4Body: {
    en: "Once eligible, the Claim Reward button becomes available.",
    km: "នៅពេលអ្នកមានសិទ្ធិ ប៊ូតុងទទួលរង្វាន់នឹងអាចចុចបាន។",
  },
  attUnlockStep5Title: { en: "New month, fresh start", km: "ខែថ្មី ចាប់ផ្តើមថ្មី" },
  attUnlockStep5Body: {
    en: "Each month starts a new attendance calculation. Previous-month progress doesn't carry over, but any points you've already earned stay in your account.",
    km: "រាល់ខែចាប់ផ្តើមការគណនាវត្តមានថ្មី។ វឌ្ឍនភាពខែមុនមិនបន្តទៅខែថ្មីទេ ប៉ុន្តែពិន្ទុដែលអ្នកបានទទួលរួចហើយនៅតែស្ថិតក្នុងគណនីរបស់អ្នក។",
  },
} as const;

export type CopyKey = keyof typeof COPY;

export function t(key: CopyKey, lang: Lang): string {
  return COPY[key][lang] ?? COPY[key].en;
}

/** Format a template string like `"Hi {name}"` with a record. */
export function tpl(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    values[k] != null ? String(values[k]) : `{${k}}`,
  );
}
