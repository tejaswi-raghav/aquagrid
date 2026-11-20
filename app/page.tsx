import { DisruptionStory } from "@/components/sections/DisruptionStory";
import { Explore, ScrollProgress } from "@/components/sections/Explore";
import { ExplodedView } from "@/components/sections/ExplodedView";
import { SeaToTap } from "@/components/sections/SeaToTap";
import { SiteFooter, SiteHeader } from "@/components/sections/SiteChrome";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <ScrollProgress />
      <main id="main">
        <ExplodedView />
        <SeaToTap />
        <DisruptionStory />
        <Explore />
      </main>
      <SiteFooter />
    </>
  );
}
