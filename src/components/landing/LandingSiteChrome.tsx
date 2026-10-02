import LandingFooter from "@/components/landing/LandingFooter";
import LandingNav from "@/components/landing/LandingNav";
import ThemeLightDocument from "@/components/ThemeLightDocument";
import "./landing.css";

export default function LandingSiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-root theme-light is-ready">
      <ThemeLightDocument />
      <LandingNav ariaLabel="Site" />
      {children}
      <LandingFooter />
    </div>
  );
}
