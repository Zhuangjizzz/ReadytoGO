import type { Candidate, Language, Origin } from "../shared/contracts";
import { StaticMap, type MapMarker } from "./StaticMap";
export function MapPanel({
  origin,
  candidates,
  selectedId,
  language,
  onSelect,
}: {
  origin: Origin;
  candidates: Candidate[];
  selectedId?: string | null;
  language: Language;
  onSelect: (id: string) => void;
}) {
  const markers: MapMarker[] = [
    { id: "origin", position: origin, label: origin.label, origin: true },
  ];
  candidates.forEach((c, i) => {
    if (c.position)
      markers.push({
        id: c.toiletId,
        position: c.position,
        label: c.nameZh,
        number: i + 1,
      });
  });
  const selected = candidates.find((c) => c.toiletId === selectedId);
  return (
    <div className="candidate-map">
      <StaticMap
        center={origin}
        markers={markers}
        selectedId={selectedId}
        language={language}
        onSelect={onSelect}
      />
      {selected && (
        <p className="map-selection" role="status">
          {selected.nameZh} · {selected.addressZh || selected.district}
        </p>
      )}
    </div>
  );
}
