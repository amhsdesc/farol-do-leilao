"use client";

import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

// [id, lat, lon, desconto]
export type PontoCompacto = [number, number, number, number | null];
export type Bbox = [number, number, number, number];

const ESTILO = process.env.NEXT_PUBLIC_MAPA_ESTILO ?? "https://tiles.openfreemap.org/styles/liberty";
const BRASIL: Bbox = [-74, -33.8, -34.7, 5.3];

type Props = {
  pontos: PontoCompacto[];
  enquadrar?: { bbox: Bbox; chave: number };
  selecionado?: number | null;
  onMover: (bbox: Bbox) => void;
  onSelecionar: (id: number | null) => void;
};

export default function MapaBusca({ pontos, enquadrar, selecionado, onMover, onSelecionar }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const pronto = useRef<Promise<void> | null>(null);
  // callbacks mudam a cada render; o mapa lê sempre a versão atual
  const cb = useRef({ onMover, onSelecionar });
  cb.current = { onMover, onSelecionar };

  useEffect(() => {
    if (!caixa.current) return;
    const m = new maplibregl.Map({
      container: caixa.current,
      style: ESTILO,
      bounds: BRASIL,
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("error", (e) => console.warn("mapa:", (e as { error?: Error }).error?.message ?? e));
    mapa.current = m;
    const avisar = () => {
      const b = m.getBounds();
      cb.current.onMover([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((v) => +v.toFixed(5)) as Bbox);
    };
    pronto.current = new Promise((ok) =>
      m.once("load", () => {
        m.addSource("imoveis", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterRadius: 44,
          clusterMaxZoom: 13,
        });
        m.addLayer({
          id: "grupos",
          type: "circle",
          source: "imoveis",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#4B3BB0",
            "circle-radius": ["step", ["get", "point_count"], 16, 20, 20, 100, 26, 1000, 32],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });
        m.addLayer({
          id: "grupos-n",
          type: "symbol",
          source: "imoveis",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 13, "text-font": ["Noto Sans Bold"] },
          paint: { "text-color": "#ffffff" },
        });
        m.addLayer({
          id: "pontos",
          type: "circle",
          source: "imoveis",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["interpolate", ["linear"], ["coalesce", ["get", "d"], 0], 0, "#B7AEEF", 0.3, "#4B3BB0", 0.5, "#2A1F7A"],
            "circle-radius": 8,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#FFC93C",
          },
        });
        m.addLayer({
          id: "selecionado",
          type: "circle",
          source: "imoveis",
          filter: ["==", ["get", "id"], -1],
          paint: { "circle-color": "#FFC93C", "circle-radius": 11, "circle-stroke-width": 3, "circle-stroke-color": "#1F1B2E" },
        });
        m.on("click", "pontos", (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id != null) cb.current.onSelecionar(Number(id));
        });
        m.on("click", "grupos", async (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const src = m.getSource("imoveis") as maplibregl.GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(f.properties!.cluster_id);
          m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
        });
        m.on("click", (e) => {
          if (!m.queryRenderedFeatures(e.point, { layers: ["pontos", "grupos"] }).length) cb.current.onSelecionar(null);
        });
        for (const camada of ["pontos", "grupos"]) {
          m.on("mouseenter", camada, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", camada, () => (m.getCanvas().style.cursor = ""));
        }
        m.on("moveend", avisar);
        avisar();
        ok();
      }),
    );
    return () => m.remove();
  }, []);

  useEffect(() => {
    pronto.current?.then(() => {
      const src = mapa.current?.getSource("imoveis") as maplibregl.GeoJSONSource | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: pontos.map(([id, lat, lon, d]) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: { id, d },
        })),
      });
    });
  }, [pontos]);

  useEffect(() => {
    if (!enquadrar) return;
    pronto.current?.then(() => {
      const [o, s, l, n] = enquadrar.bbox;
      // um ponto só (bairro com 1 imóvel) vira uma área pequena em volta
      const folga = 0.01;
      mapa.current?.fitBounds([[o - folga, s - folga], [l + folga, n + folga]], { padding: 40, maxZoom: 15 });
    });
  }, [enquadrar]);

  useEffect(() => {
    pronto.current?.then(() => mapa.current?.setFilter("selecionado", ["==", ["get", "id"], selecionado ?? -1]));
  }, [selecionado]);

  return <div ref={caixa} className="mapa-busca" aria-label="Mapa dos imóveis em leilão" />;
}
