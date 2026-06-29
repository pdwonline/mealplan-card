/**
 * Reactive controller for managing meal plan state
 * Implements Lit's ReactiveController pattern - calls host.requestUpdate() when state changes
 */
import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { FeedingTime, DeviceProfile } from './types';
import type { HasGetter, MealPlanCardConfig, StorageAdapter } from './types';
import { createStorageAdapter } from './adapters/storage-adapter';
import { log } from './logger';
import { areMealsEqual } from './utils';

export class MealStateController implements ReactiveController {
  private _meals: FeedingTime[] = [];
  private subscribers = new Set<() => void>();
  private _saving = false;

  hass: HasGetter;
  profile: DeviceProfile;
  config: MealPlanCardConfig;
  private adapter: StorageAdapter;

  get meals(): FeedingTime[] {
    return this._meals;
  }

  set meals(value: FeedingTime[]) {
    this._meals = value;
    log.debug('Notify subscribers of meals set to:', value);
    this.notifySubscribers();
  }

  constructor(
    private host: ReactiveControllerHost,
    profile: DeviceProfile,
    hass: HasGetter,
    config: MealPlanCardConfig,
  ) {
    this.host.addController(this);
    this.profile = profile;
    this.hass = hass;
    this.config = config;
    this.adapter = createStorageAdapter(hass, config, profile);

    if (this.hass()) {
      this.updateFromHass().catch((error) => {
        log.error('Failed to load initial data:', error);
      });
    } else {
      log.warn(
        'Initialized without hass object. Data loading will be skipped.',
      );
    }
  }

  hostConnected(): void { }

  hostDisconnected(): void {
    this.subscribers.clear();
  }

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers(): void {
    this.host.requestUpdate();
    this.subscribers.forEach((callback) => callback());
  }

  async updateFromHass(allowUpdate: boolean = true): Promise<void> {
    if (this._saving) {
      log.debug('Skipping updateFromHass - save in progress');
      return;
    }

    const decodedMeals = await this.adapter.read();

    if (allowUpdate) {
      const newMeals = decodedMeals ? [...decodedMeals] : [];
      if (!areMealsEqual(decodedMeals, this.meals)) {
        this.meals = newMeals;
      } else {
        log.debug('Skipping update - meals unchanged', this.meals);
      }
    }
  }

  async saveMeals(meals: FeedingTime[]): Promise<void> {
    this._saving = true;
    await this.adapter.write(meals);
    this.meals = [...meals];
    setTimeout(() => {
      this._saving = false;
    }, 5000);
  }

  public async isDataAvailable(): Promise<boolean> {
    try {
      const available = await this.adapter.isDataAvailable();
      if (!available) {
        log.warn(
          '[MealStateController] Data not available - adapter returned empty value',
        );
      }
      return available;
    } catch (error) {
      log.warn(
        '[MealStateController] Failed to read data from adapter:',
        error,
      );
      return false;
    }
  }
}