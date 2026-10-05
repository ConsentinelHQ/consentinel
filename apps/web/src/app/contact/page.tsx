import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Contact - Consentinel",
  description: "Questions about a scan, your report, or monitoring.",
};

export default function Contact() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <h1>Tell us what you’re working with.</h1>
          <p className="lede">
            The more concrete the better. Your domain, roughly how many pages, and whether this is
            being driven by a deadline, an auditor, or a card processor.
          </p>
          <ContactForm />
        </div>
      </section>
    </main>
  );
}
