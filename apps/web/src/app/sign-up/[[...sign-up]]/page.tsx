import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap auth-wrap">
          <SignUp />
        </div>
      </section>
    </main>
  );
}
