import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page shell not-found">
      <span>404</span>
      <h1>Out of bounds.</h1>
      <p>That page is not on this week&apos;s slate.</p>
      <Link className="button button-dark" href="/">Return home</Link>
    </section>
  );
}
