/**
 * VNVariableStore - Système de variables exact
 *
 * Reproduit fidèlement le comportement de vndllapi.dll:
 * - VNDLLVarFind: Recherche insensible à la casse (stricmp)
 * - VNDLLVarAddModify: Stockage en MAJUSCULES (strupr)
 * - Structure: name[256] + value(int32) + next pointer
 *
 * En JavaScript, on utilise un Map avec clés en majuscules
 * pour reproduire le comportement exact.
 */

import { VNVariable } from '../types/vn.types';

export class VNVariableStore {
  // Map avec clés en MAJUSCULES (reproduit strupr)
  private variables: Map<string, number> = new Map();

  // Historique des modifications (pour debug/undo)
  private history: Array<{ name: string; oldValue: number | undefined; newValue: number; timestamp: number }> = [];

  // Limite de nom: 255 caractères (char name[256] avec null terminator)
  private static readonly MAX_NAME_LENGTH = 255;

  // Callback pour les changements
  private onChangeCallback?: (name: string, value: number) => void;

  constructor() {
    this.variables = new Map();
    this.history = [];
  }

  /**
   * Normalise le nom de variable (reproduit strupr)
   * Convertit en MAJUSCULES et tronque à 255 caractères
   */
  private normalizeName(name: string): string {
    if (!name) return '';
    return name.toUpperCase().substring(0, VNVariableStore.MAX_NAME_LENGTH);
  }

  /**
   * VNDLLVarFind - Recherche une variable
   * Reproduit le comportement exact de vndllapi.dll @ 0x00401499
   * Recherche insensible à la casse
   *
   * @param name Nom de la variable (insensible à la casse)
   * @returns La valeur ou undefined si non trouvée
   */
  find(name: string): number | undefined {
    if (!name) return undefined;
    const normalizedName = this.normalizeName(name);
    return this.variables.get(normalizedName);
  }

  /**
   * Vérifie si une variable existe
   */
  exists(name: string): boolean {
    if (!name) return false;
    return this.variables.has(this.normalizeName(name));
  }

  /**
   * VNDLLVarAddModify - Ajoute ou modifie une variable
   * Reproduit le comportement exact de vndllapi.dll @ 0x004014dd
   * - Convertit le nom en MAJUSCULES
   * - Crée la variable si elle n'existe pas
   * - Modifie la valeur si elle existe
   *
   * @param name Nom de la variable
   * @param value Valeur entière (int32)
   * @returns La valeur définie
   */
  addModify(name: string, value: number): number {
    if (!name) {
      throw new Error('Variable name cannot be empty');
    }

    const normalizedName = this.normalizeName(name);

    // Convertir en int32 signé (reproduit le comportement C)
    const int32Value = this.toInt32(value);

    // Enregistrer dans l'historique
    const oldValue = this.variables.get(normalizedName);
    this.history.push({
      name: normalizedName,
      oldValue,
      newValue: int32Value,
      timestamp: Date.now(),
    });

    // Définir la variable
    this.variables.set(normalizedName, int32Value);

    // Callback de changement
    if (this.onChangeCallback) {
      this.onChangeCallback(normalizedName, int32Value);
    }

    return int32Value;
  }

  /**
   * Alias pour addModify (compatibilité)
   */
  set(name: string, value: number): number {
    return this.addModify(name, value);
  }

  /**
   * Récupère la valeur d'une variable (0 si non existante)
   * Reproduit le comportement du moteur original
   */
  get(name: string): number {
    const value = this.find(name);
    return value !== undefined ? value : 0;
  }

  /**
   * Incrémente une variable
   * Reproduit INCVAR command
   *
   * @param name Nom de la variable
   * @param amount Montant à ajouter (défaut: 1)
   */
  increment(name: string, amount: number = 1): number {
    const currentValue = this.get(name);
    return this.addModify(name, currentValue + amount);
  }

  /**
   * Décrémente une variable
   * Reproduit DECVAR command
   *
   * @param name Nom de la variable
   * @param amount Montant à soustraire (défaut: 1)
   */
  decrement(name: string, amount: number = 1): number {
    const currentValue = this.get(name);
    return this.addModify(name, currentValue - amount);
  }

  /**
   * Convertit en int32 signé (reproduit le comportement C)
   * Les valeurs sont stockées comme int32_t dans l'original
   */
  private toInt32(value: number): number {
    // Tronquer à 32 bits et gérer le signe
    const int32 = value | 0;
    return int32;
  }

  /**
   * Supprime une variable
   */
  delete(name: string): boolean {
    if (!name) return false;
    const normalizedName = this.normalizeName(name);
    const existed = this.variables.has(normalizedName);
    this.variables.delete(normalizedName);
    return existed;
  }

  /**
   * Supprime toutes les variables
   */
  clear(): void {
    this.variables.clear();
    this.history = [];
  }

  /**
   * Retourne toutes les variables sous forme de VNVariable[]
   */
  getAll(): VNVariable[] {
    const result: VNVariable[] = [];
    this.variables.forEach((value, name) => {
      result.push({ name, value });
    });
    return result;
  }

  /**
   * Retourne le nombre de variables
   */
  get count(): number {
    return this.variables.size;
  }

  /**
   * Exporte l'état (pour sauvegarde)
   */
  export(): Record<string, number> {
    const result: Record<string, number> = {};
    this.variables.forEach((value, name) => {
      result[name] = value;
    });
    return result;
  }

  /**
   * Importe un état (pour chargement)
   */
  import(data: Record<string, number>): void {
    this.clear();
    for (const [name, value] of Object.entries(data)) {
      this.addModify(name, value);
    }
  }

  /**
   * Définit le callback de changement
   */
  setOnChange(callback: (name: string, value: number) => void): void {
    this.onChangeCallback = callback;
  }

  /**
   * Retourne l'historique des modifications
   */
  getHistory(): Array<{ name: string; oldValue: number | undefined; newValue: number; timestamp: number }> {
    return [...this.history];
  }

  /**
   * Évalue une expression simple avec des variables
   * Supporte: +, -, *, /, %, et les noms de variables
   */
  evaluateExpression(expression: string): number {
    // Remplacer les noms de variables par leurs valeurs
    let expr = expression.toUpperCase();

    // Trouver tous les identifiants (lettres et underscores)
    const identifierRegex = /[A-Z_][A-Z0-9_]*/g;
    let match;

    while ((match = identifierRegex.exec(expr)) !== null) {
      const varName = match[0];
      if (this.exists(varName)) {
        expr = expr.replace(new RegExp(`\\b${varName}\\b`, 'g'), this.get(varName).toString());
      }
    }

    // Évaluer l'expression mathématique simple
    try {
      // Sécurité: n'autoriser que les chiffres et opérateurs mathématiques de base
      if (!/^[\d+\-*/%().\s]+$/.test(expr)) {
        throw new Error(`Invalid expression: ${expression}`);
      }
      // eslint-disable-next-line no-eval
      const result = Function(`"use strict"; return (${expr})`)();
      return this.toInt32(result);
    } catch {
      throw new Error(`Failed to evaluate expression: ${expression}`);
    }
  }

  /**
   * Compare deux valeurs selon un opérateur
   * Utilisé pour les conditions IF
   */
  compare(leftValue: number, operator: string, rightValue: number): boolean {
    switch (operator) {
      case '==':
      case '=':
        return leftValue === rightValue;
      case '!=':
      case '<>':
        return leftValue !== rightValue;
      case '<':
        return leftValue < rightValue;
      case '<=':
        return leftValue <= rightValue;
      case '>':
        return leftValue > rightValue;
      case '>=':
        return leftValue >= rightValue;
      default:
        throw new Error(`Unknown comparison operator: ${operator}`);
    }
  }

  /**
   * Debug: affiche toutes les variables
   */
  dump(): void {
    console.log('=== VNVariableStore Dump ===');
    console.log(`Total variables: ${this.count}`);
    this.variables.forEach((value, name) => {
      console.log(`  ${name} = ${value}`);
    });
    console.log('============================');
  }
}

// Singleton global (comme dans l'original)
let globalVariableStore: VNVariableStore | null = null;

export function getGlobalVariableStore(): VNVariableStore {
  if (!globalVariableStore) {
    globalVariableStore = new VNVariableStore();
  }
  return globalVariableStore;
}

export function resetGlobalVariableStore(): void {
  if (globalVariableStore) {
    globalVariableStore.clear();
  }
  globalVariableStore = new VNVariableStore();
}
