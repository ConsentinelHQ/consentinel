import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap auth-wrap">
          <SignIn />
        </div>
      </section>
    </main>
  );
}
