// Review Booster wording: request messages by business type, and the reply
// library. {first} = customer's first name, {business} = business name,
// {link} = review link.

export const TYPES = {
  general: "Any business",
  trades: "Trades and home services",
  restaurant: "Restaurant, cafe or bar",
  salon: "Salon, spa or beauty",
  health: "Clinic, therapy or wellness",
  retail: "Shop or online store",
  fitness: "Gym, studio or coach",
  professional: "Professional services",
  auto: "Auto repair or detailing"
};

// What the customer just experienced, in their words.
const MOMENT = {
  general: "working with us",
  trades: "the work we did at your place",
  restaurant: "your visit",
  salon: "your appointment",
  health: "your visit",
  retail: "your order",
  fitness: "training with us",
  professional: "working with us",
  auto: "the work on your vehicle"
};

export function requestMessages(type) {
  const m = MOMENT[type] || MOMENT.general;
  return {
    text: `Hi {first}, thanks for choosing {business}! If you were happy with ${m}, would you leave us a quick Google review? It really helps a small business like ours: {link}`,
    whatsapp: `Hi {first}! Thank you for choosing {business} \u{1F64F} If you were happy with ${m}, a quick Google review would mean a lot to us. It takes about 30 seconds: {link}`,
    emailSubject: `How did we do, {first}?`,
    emailBody: `Hi {first},\n\nThank you for choosing {business}. We hope you were happy with ${m}.\n\nIf you have a moment, would you share your experience in a quick Google review? It takes about 30 seconds, and it helps other people find a business they can trust:\n\n{link}\n\nIf anything wasn't right, just reply to this email. We read every message and we'll make it right.\n\nThank you,\n{business}`,
    followUp: `Hi {first}, just a gentle nudge from {business}. If you have 30 seconds, a Google review would really help us out: {link}. Thank you either way!`
  };
}

// Paid: ready-made replies for the reviews that come in.
export const REPLIES = [
  { when: "5 stars, with details", text: "Thank you so much, {first}! We're thrilled you were happy with {detail}. Reviews like yours mean the world to a small business. We look forward to seeing you again. — {owner}, {business}" },
  { when: "5 stars, no comment", text: "Thank you for the five stars, {first}! We really appreciate you taking the time. See you next time! — {business}" },
  { when: "4 stars", text: "Thanks for the great review, {first}! We're glad you had a good experience. If there's anything that would have made it a five-star visit, we'd love to hear it. Just reply here or give us a call. — {owner}, {business}" },
  { when: "3 stars, mixed", text: "Thank you for the honest feedback, {first}. We're glad parts of your experience went well, and we're sorry {issue} fell short. We'd like to make it right. Please reach out to us directly at {contact} so we can talk it through. — {owner}, {business}" },
  { when: "1–2 stars, a real problem", text: "{first}, we're sorry your experience wasn't what it should have been. That's not the standard we hold ourselves to. We'd like to understand what happened and fix it. Please contact {owner} directly at {contact}. — {business}" },
  { when: "1–2 stars, slow service or wait", text: "Thank you for letting us know, {first}, and we're sorry about the wait. We've shared your feedback with the team so it doesn't happen again. We'd love the chance to give you the experience you deserve. — {owner}, {business}" },
  { when: "Negative, price complaint", text: "Thanks for your feedback, {first}. We understand price matters, and we work hard to keep ours fair for the quality of {service} we provide. If you'd like to talk through your invoice, please reach us at {contact}. — {owner}, {business}" },
  { when: "Can't find this customer", text: "Hi {first}, thank you for taking the time to write this. We take every review seriously, but we can't find a record of your visit. Please contact us at {contact} with a few details so we can look into it properly. — {owner}, {business}" },
  { when: "Review mentions a staff member", text: "Thank you, {first}! We'll make sure {staff} sees this. They'll be so happy to hear it. We appreciate you! — {business}" },
  { when: "Returning customer", text: "{first}, thank you for coming back and for the kind words! Loyal customers like you are the reason we love what we do. See you soon! — {owner}, {business}" }
];

export const fill = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null && v[k] !== "" ? v[k] : m));
