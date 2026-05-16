// import { Inngest } from "inngest";

// // Create a client to send and receive events
// export const inngest = new Inngest({ id: "isotope" });

// src/inngest/client.ts
import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'isotope',
  isDev: process.env.NODE_ENV === 'development', // ← add this
})