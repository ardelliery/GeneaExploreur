"""
Module de recherche géographique en cascade avec la base GeoNames. 
Ce script enrichit la liste des lieux extraits d'un fichier GEDCOM en recherchant
leurs coordonnées géographiques (latitude, longitude), code INSEE et département
dans les fichiers de référence GeoNames (ex: FR.txt, CH.txt) via une stratégie de recherche en cascade.

Modifications apportées :
- La validation des lieux déjà identifiés dans liste_lieux_complet.csv repose désormais 
  sur la présence de la latitude et de la longitude (compatible France + Suisse).
- Propose une saisie manuelle relançant la recherche si le choix 0 est sélectionné.

Colonnes exportées dans liste_lieux_complet.csv :
place_geoname, place, lat, lon, insee, dept
"""

import csv
import logging
import os

# Configuration du système de journalisation (LOG)
logging.basicConfig(
    filename='recherche_geo_cascade.log',
    level=logging.INFO,
    format='%(levelname)s: %(message)s',
    filemode='w',
    encoding='utf-8',
)

# Fichiers de données et bases de référence GeoNames
INPUT_CSV = 'liste_lieux.csv'
OUTPUT_CSV = 'liste_lieux_complet.csv'
GEONAMES_FILES = ['FR.txt', 'CH.txt']


def clean_key(text):
  """Nettoie et normalise une chaîne de caractères pour la recherche :

  - Passage en minuscules (insensible à la casse)
  - Remplacement de tous les espaces par des tirets du 6 ('-')
  - Suppression des espaces de début/fin
  """
  if not text:
    return ''
  cleaned = text.strip().lower()
  cleaned = cleaned.replace(' ', '-')
  return cleaned


def load_geonames_to_dict(files):
  """Charge les fichiers de référence GeoNames dans un dictionnaire d'indexation."""
  geo_data = {}
  print('Chargement des bases France et Suisse...')
  for filename in files:
    if not os.path.exists(filename):
      logging.error(f'Fichier référence manquant : {filename}')
      continue

    with open(filename, 'r', encoding='utf-8') as f:
      reader = csv.reader(f, delimiter='\t')
      for row in reader:
        if len(row) < 6:
          continue

        name_raw = row[1].strip()
        ascii_raw = row[2].strip()  # Champ 2 : asciiname
        alt_raw = row[3].strip() if len(row) > 3 else ''  # Champ 3 : alternatenames

        keys_to_index = {clean_key(name_raw), clean_key(ascii_raw)}

        if alt_raw:
          for alt in alt_raw.split(','):
            k = clean_key(alt)
            if k:
              keys_to_index.add(k)

        info = {
            'name_official': name_raw,
            'asciiname': ascii_raw,
            'lat': row[4].strip(),
            'lon': row[5].strip(),
            'insee': row[13].strip() if len(row) > 13 else '',
            'dept': row[11].strip() if len(row) > 11 else '',
        }

        if not info['lat'] or not info['lon']:
          continue

        for key in keys_to_index:
          if not key:
            continue
          if key not in geo_data:
            geo_data[key] = []

          is_duplicate = any(
              item['lat'] == info['lat'] and item['lon'] == info['lon']
              for item in geo_data[key]
          )
          if not is_duplicate:
            geo_data[key].append(info)

  return geo_data


def choose_best_match(matches, place_full, methode, geo_index):
  """Permet à l'utilisateur de choisir parmi plusieurs correspondances géographiques.

  Si l'utilisateur choisit 0, il a la possibilité de saisir un nouveau terme de
  recherche.
  """
  current_matches = matches
  current_methode = methode

  while True:
    if not current_matches:
      print(f"\n[!] Aucune correspondance automatique pour '{place_full}'.")
      manual_input = (
          input(
              "Saisissez manuellement un nom de lieu à rechercher dans GeoNames"
              " (ou Appuyez sur Entrée pour passer) : "
          )
          .strip()
      )
      if not manual_input:
        return None

      manual_key = clean_key(manual_input)
      if manual_key in geo_index:
        current_matches = geo_index[manual_key]
        current_methode = f"SAISIE_MANUELLE('{manual_input}')"
      else:
        print(f" -> Aucun résultat trouvé pour '{manual_input}'.")
        continue

    if len(current_matches) == 1:
      print(
          f" -> 1 résultat unique trouvé via {current_methode} :"
          f" {current_matches[0]['name_official']} (Dept:"
          f" {current_matches[0]['dept']}, INSEE: {current_matches[0]['insee']},"
          f" Lat: {current_matches[0]['lat']}, Lon: {current_matches[0]['lon']})"
      )
      confirm = (
          input("Confirmer cette sélection ? [O/n] : ").strip().lower()
      )
      if confirm in ['', 'o', 'oui', 'y', 'yes']:
        return current_matches[0]
      else:
        current_matches = []
        continue

    print(
        f"\n[?] Correspondances trouvées pour '{place_full}'"
        f' (via {current_methode}) :'
    )
    print(
        '  0 : Aucun (Saisir un autre nom manuellement ou passer au suivant)'
    )

    for idx, match in enumerate(current_matches, 1):
      dept_str = f"Dépt: {match['dept']}" if match['dept'] else 'Dépt: N/A'
      insee_str = f"INSEE: {match['insee']}" if match['insee'] else 'INSEE: N/A'
      print(
          f"  {idx} : {match['name_official']} [GeoName Champ 2:"
          f" {match['asciiname']}] ({dept_str}, {insee_str}, Lat:"
          f" {match['lat']}, Lon: {match['lon']})"
      )

    try:
      choice = input(
          f'Faites votre choix [0-{len(current_matches)}] (0 par défaut) : '
      ).strip()
      if choice == '' or choice == '0':
        manual_input = (
            input(
                "\nSaisissez manuellement un nom de lieu à rechercher dans"
                " GeoNames (ou Entrée pour ignorer) : "
            )
            .strip()
        )
        if not manual_input:
          return None

        manual_key = clean_key(manual_input)
        if manual_key in geo_index:
          current_matches = geo_index[manual_key]
          current_methode = f"SAISIE_MANUELLE('{manual_input}')"
        else:
          print(f" -> Aucun résultat trouvé pour '{manual_input}'.")
          current_matches = []
        continue

      idx_chosen = int(choice)
      if 1 <= idx_chosen <= len(current_matches):
        return current_matches[idx_chosen - 1]
      print('Choix invalide, veuillez saisir un numéro dans la liste.')
    except ValueError:
      print('Saisie incorrecte, veuillez entrer un nombre entier.')


def filter_by_context(matches, context_parts):
  """Filtre les résultats si le département ou une sous-partie apparaît dans le contexte."""
  if not matches or not context_parts:
    return matches

  filtered = []
  for m in matches:
    dept = m.get('dept', '')
    insee = m.get('insee', '')
    for part in context_parts:
      part_clean = clean_key(part)
      if (dept and dept == part_clean) or (
          insee and insee.startswith(part_clean)
      ):
        filtered.append(m)

  if filtered:
    return filtered

  return matches


def lookup_place(place_full, geo_index):
  """Effectue la recherche en cascade dans l'index GeoNames."""
  raw_parts = [p.strip() for p in place_full.split(',') if p.strip()]

  matches = []
  methode = ''

  full_key = clean_key(place_full)
  if full_key in geo_index:
    matches = geo_index[full_key]
    methode = 'FULL_MATCH'

  if not matches:
    all_candidates = []
    for i, part in enumerate(raw_parts):
      part_key = clean_key(part)
      if part_key in ['france', 'suisse']:
        continue

      if part_key in geo_index:
        part_matches = geo_index[part_key]
        context = raw_parts[:i] + raw_parts[i + 1 :]
        refined = filter_by_context(part_matches, context)

        for m in refined:
          if m not in all_candidates:
            all_candidates.append(m)

        if not methode:
          methode = f'PART_{i+1}_MATCH'

    matches = all_candidates

  return matches, methode


def main():
  """Fonction principale."""
  geo_index = load_geonames_to_dict(GEONAMES_FILES)

  existing_validated = {}
  to_reprocess = {}

  # 2. Lecture préalable de liste_lieux_complet.csv s'il existe
  if os.path.exists(OUTPUT_CSV):
    print(
        f'Lecture du fichier existant {OUTPUT_CSV} pour trier les lieux'
        ' validés et à re-tester...'
    )
    with open(OUTPUT_CSV, 'r', encoding='utf-8') as f:
      reader = csv.DictReader(f)
      for row in reader:
        place_val = row.get('place', '').strip()
        if not place_val:
          continue

        lat = row.get('lat', '').strip()
        lon = row.get('lon', '').strip()

        # Validation basée sur la présence de la LATITUDE et LONGITUDE
        if lat and lon:
          existing_validated[place_val] = {
              'place_geoname': row.get('place_geoname', ''),
              'place': place_val,
              'lat': lat,
              'lon': lon,
              'insee': row.get('insee', '').strip(),
              'dept': row.get('dept', '').strip(),
          }
        else:
          to_reprocess[place_val] = {
              'place': place_val,
              'place_orig': row.get('place_orig', place_val),
          }

  # 3. Lecture du fichier d'entrée (liste_lieux.csv)
  if os.path.exists(INPUT_CSV):
    print(
        f'Lecture de {INPUT_CSV} pour ajouter les nouveaux lieux à traiter...'
    )
    with open(INPUT_CSV, 'r', encoding='utf-8') as f:
      reader = csv.DictReader(f)
      for row in reader:
        place_orig = row.get('place_orig') or row.get('place', '')
        place_full = row.get('place', place_orig)

        if place_full in existing_validated:
          continue

        if place_full not in to_reprocess:
          to_reprocess[place_full] = {
              'place': place_full,
              'place_orig': place_orig,
          }

  results = list(existing_validated.values())

  print(
      f'Traitement des {len(to_reprocess)} lieux non encore identifiés'
      ' (recyclés + nouveaux)...'
  )

  # 4. Exécution de la recherche en cascade et choix interactif
  for place_key, item in to_reprocess.items():
    place_full = item['place']
    matches, methode = lookup_place(place_full, geo_index)

    match_selected = choose_best_match(matches, place_full, methode, geo_index)

    # Validation basée sur la présence de coordonnées géographiques (lat & lon)
    if match_selected and match_selected.get('lat') and match_selected.get('lon'):
      logging.info(
          f"SUCCÈS [{methode}] : '{place_full}' -> retenu Lat:"
          f" {match_selected.get('lat')}, Lon: {match_selected.get('lon')}"
      )
      results.append({
          'place_geoname': match_selected.get('asciiname', ''),
          'place': place_full,
          'lat': match_selected['lat'],
          'lon': match_selected['lon'],
          'insee': match_selected['insee'],
          'dept': match_selected['dept'],
      })
    else:
      logging.warning(
          f"NON RETENU / ÉCHEC : Aucune sélection pour '{place_full}'"
      )
      results.append({
          'place_geoname': '',
          'place': place_full,
          'lat': '',
          'lon': '',
          'insee': '',
          'dept': '',
      })

  # 5. Export consolidé dans liste_lieux_complet.csv
  fieldnames = ['place_geoname', 'place', 'lat', 'lon', 'insee', 'dept']
  with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(results)

  print(f'\nTraitement terminé. Résultats consolidés dans {OUTPUT_CSV}')
  print(
      "Consultez 'recherche_geo_cascade.log' pour voir les détails d'exécution."
  )


if __name__ == '__main__':
  main()