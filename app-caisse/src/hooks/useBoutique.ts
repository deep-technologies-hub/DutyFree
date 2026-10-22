import { useEffect, useState } from 'react';
import { api } from '../api';

/** En-tête des tickets : paramètres de la boutique (organisation) connectée. */
export interface Boutique {
  nom_boutique: string;
  adresse: string;
  nif: string;
  telephone: string;
  msg_accueil_1: string;
  msg_accueil_2: string;
  msg_politesse: string;
}

const KEY = 'df_boutique';

function lireCache(): Boutique | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

/** Configuration de la boutique, mise en cache local pour imprimer les tickets hors ligne. */
export function useBoutique(): Boutique | null {
  const [boutique, setBoutique] = useState<Boutique | null>(lireCache);
  useEffect(() => {
    api.get<Boutique>('/configuration/')
      .then(cfg => {
        setBoutique(cfg);
        try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* stockage indisponible */ }
      })
      .catch(() => { /* hors ligne : on garde le cache */ });
  }, []);
  return boutique;
}
