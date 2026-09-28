"use client";

import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

export type Ponto = {
  imovel_id: number;
  lat: number | null;
  lon: number | null;
  lance_minimo: number | null;
  tipo: string;
  titulo: string | null;
  desconto_avaliacao: number | null;
};

// Estilo vetorial gratuito, sem chave. Troque por outro provedor se precisar.
const ESTILO = process.env.NEXT_PUBLIC_MAPA_ESTILO ?? "https://tiles.openfreemap.org/styles/liberty";
const CENTRO_DF: [number, number] = [-47.93, -15.78];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function escapar(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export default function Mapa({ pontos, altura = "100%" }: { pontos: Ponto[]; altura?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!caixa.current) return;
    const m = new maplibregl.Map({ container: caixa.current, style: ESTILO, center: CENTRO_DF, zoom: 9 });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapa.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const validos = pontos.filter((p) => p.lat != null && p.lon != null);
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: validos.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon!, p.lat!] },
        properties: {
          id: p.imovel_id,
          titulo: p.titulo ?? p.tipo,
          preco: p.lance_minimo ? brl.format(p.lance_minimo) : "",
          desconto: p.desconto_avaliacao ?? 0,
        },
      })),
    };
    const aplicar = () => {
      const fonte = m.getSource("imoveis") as maplibregl.GeoJSONSource | undefined;
      if (fonte) {
        fonte.setData(geojson);
      } else {
        m.addSource("imoveis", { type: "geojson", data: geojson, cluster: true, clusterRadius: 40 });
        m.addLayer({
          id: "grupos",
          type: "circle",
          source: "imoveis",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#1c6b5f",
            "circle-radius": ["step", ["get", "point_count"], 14, 20, 18, 100, 24],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        m.addLayer({
          id: "grupos-n",
          type: "symbol",
          source: "imoveis",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
          paint: { "text-color": "#ffffff" },
        });
        m.addLayer({
          id: "pontos",
          type: "circle",
          source: "imoveis",
          filter: ["!", ["has", "point_count"]],
          paint: {
            // mais desconto = mais escuro
            "circle-color": ["interpolate", ["linear"], ["get", "desconto"], 0, "#e0a23a", 0.3, "#a8700f", 0.5, "#6b4508"],
            "circle-radius": 7,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        m.on("click", "pontos", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as { id: number; titulo: string; preco: string };
          new maplibregl.Popup({ offset: 10 })
            .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
            .setHTML(`<strong>${escapar(p.titulo)}</strong><br>${escapar(p.preco)}<br><a href="/imovel/${p.id}">Ver imóvel</a>`)
            .addTo(m);
        });
        m.on("click", "grupos", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: m.getZoom() + 2 });
        });
        for (const camada of ["pontos", "grupos"]) {
          m.on("mouseenter", camada, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", camada, () => (m.getCanvas().style.cursor = ""));
        }
      }
      if (validos.length) {
        const b = new maplibregl.LngLatBounds();
        validos.forEach((p) => b.extend([p.lon!, p.lat!]));
        m.fitBounds(b, { padding: 50, maxZoom: 14, duration: 0 });
      }
    };
    if (m.isStyleLoaded()) aplicar();
    else m.once("load", aplicar);
  }, [pontos]);

  return <div ref={caixa} style={{ width: "100%", height: altura }} aria-label="Mapa dos imóveis" />;
}
