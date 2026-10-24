# Devpost submission draft (edit before submitting)

## Tagline
An AI agent that chases late PayPal invoices, and asks you before it moves any money.

## Inspiration
Freelancers and small businesses don't struggle to send invoices. They struggle to get paid on time, and chasing clients is awkward, repetitive and easy to put off.

## What it does
PayPilot connects to PayPal invoicing, scores every client's late-payment risk from real payment history, forecasts the next 30 days of cash, and runs a "morning review" where an AI agent picks the right reminder tone for each overdue invoice and writes the message. Every action waits in an approval queue; nothing reaches PayPal until the owner approves it.

## How we built it
Next.js, PayPal Invoicing API v2 (sandbox), Gemini function calling for the agent, AG Grid for the invoice table. The agent has read tools (list invoices, client risk, cash forecast) and propose tools (reminder, new invoice). Only the approval endpoint calls PayPal's send and remind APIs.

## Challenges
Keeping the agent useful but safe: it can reason and draft freely, but cannot execute. Also making risk and forecast numbers explainable rather than a black box.

## What's next
Dispute triage, payment links and QR codes, multi-currency, and learning each client's best reminder timing.

## Tools used (for the form)
- PayPal Invoicing API v2 (sandbox): list/read invoices, create and send invoices, send reminders
- Google Gemini (function calling): the agent loop
- AG Grid Community: invoice table
- Render: hosting
