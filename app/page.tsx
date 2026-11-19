import { DesalModule } from "@/components/sections/DesalModule";
import { DisruptionStory } from "@/components/sections/DisruptionStory";
import { ExplodedView } from "@/components/sections/ExplodedView";
import { ReservoirSection } from "@/components/sections/ReservoirSection";
import { SiteFooter, SiteHeader } from "@/components/sections/SiteChrome";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <ExplodedView />
        <DisruptionStory />
        <section className="mx-auto max-w-[1400px] px-5 py-20 sm:px-10">
          <p className="type-kicker text-[var(--color-blue)]">FROM SOURCE TO SERVICE</p>
          <h2 className="type-h2 mt-4">Explore the plant. Operate with evidence.</h2>
          <p className="measure mt-5">Saving electricity should never put a city’s water supply at risk. AquaGrid connects the evidence, tests the consequences, and keeps humans in control.</p>
          <div className="mt-8 flex flex-wrap gap-4"><a className="btn btn-primary" href="/plant">Explore desalination</a><a className="btn btn-ghost" href="/control">Enter control centre</a></div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
