import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { localize, setLanguage } from './locales/localize';
import { MealStateController } from './mealStateController';
import type { HomeAssistant, MealPlanCardConfig } from './types';
import { OverviewField, TransportType } from './types';
import { getProfileWithTransformer } from './profiles/profiles';
import './components/overview.js';
import './components/schedule-view.js';
import './components/meal-card.js';
import { log } from './logger';
import { getVersionString } from './version';
import './config-form.js';

@customElement('mealplan-card')
export class MealPlanCard extends LitElement {
  @property({ type: Object }) hass!: HomeAssistant;
  @property({ type: Object }) config!: MealPlanCardConfig;
  @state() public mealState?: MealStateController;
  @state() private _dialogOpen = false;
  @state() private _openAddOnLoad = false;

  static get styles() {
    return css`
    :host,
    ha-card {
      display: block;
      height: 100%;
      overflow: hidden;
    }
    .inline-schedules {
      padding: 0 16px 8px 16px;
    }
    `;
  }
  setConfig(config: MealPlanCardConfig) {
    this.config = config;

    if (this.hass && this.config.manufacturer) {
      const profile = getProfileWithTransformer(this.config.manufacturer);

      if (profile) {
        this.mealState = new MealStateController(
          this,
          profile,
          () => this.hass,
          this.config,
        );
      }
    }
  }

  async connectedCallback() {
    super.connectedCallback();

    await setLanguage(this.hass?.language);

    if (this.config.manufacturer) {
      const profile = getProfileWithTransformer(this.config.manufacturer);

      if (profile) {
        this.mealState = new MealStateController(
          this,
          profile,
          () => this.hass,
          this.config,
        );
      }
    }
  }

  updated(changedProps: PropertyValues) {
    super.updated(changedProps);

    if (changedProps.has('hass') && this.mealState) {
      setLanguage(this.hass?.language);
      this.mealState.updateFromHass().catch((error) => {
        log.error('[MealPlanCard] Failed to update from hass:', error);
      });
    }
  }

  render() {
    return html`
      <ha-card header="${this.config.title}">
        ${this.renderContent()} ${this.renderScheduleDialog()}
      </ha-card>
    `;
  }

  private renderContent() {
    if (!this.mealState) {
      return this.renderConfigurationRequired();
    }

    if (this.config.show_schedules) {
      return html`
        <meal-overview
          .meals=${this.mealState.meals}
          .portions=${this.config?.portions}
          .overviewFields=${this.config.overview_fields}
        ></meal-overview>
        <div class="inline-schedules">
          ${this.mealState.meals.length === 0
          ? html`<p>${localize('schedule_view.no_meals_scheduled')}</p>`
          : this.mealState.meals.map(
            (meal, index) => html`
                  <meal-card
                    .meal=${meal}
                    .index=${index}
                    .profile=${this.mealState!.profile}
                  ></meal-card>
                `,
          )}
        <div class="card-actions">
          <ha-button
            appearance="plain"
            variant="brand"
            @click=${() => {
                  this._openAddOnLoad = true;
                  this._dialogOpen = true;
                }}
          >
            ${localize('common.add_meal')}
          </ha-button>
        </div>
      `;
    }

    return html`
      <meal-overview
        .meals=${this.mealState.meals}
        .portions=${this.config?.portions}
        .overviewFields=${this.config.overview_fields}
      ></meal-overview>
      <div class="card-actions">
        <ha-button @click=${() => (this._dialogOpen = true)}>
          <ha-icon icon="mdi:table-edit"></ha-icon>
          ${localize('main.manage_schedules')}
        </ha-button>
      </div>
    `;
  }

  private renderConfigurationRequired() {
    return html`
      <div class="card-content">
        <ha-icon icon="mdi:cog"></ha-icon>
        <p>${localize('main.configuration_required')}</p>
        <p>${localize('main.configuration_instructions')}</p>
      </div>
    `;
  }

  private renderScheduleDialog() {
    if (!this._dialogOpen || !this.mealState) {
      return '';
    }

    return html`
      <schedule-view
        .mealState=${this.mealState}
        .hass=${this.hass}
        .openAddOnLoad=${this._openAddOnLoad}
        @schedule-closed=${() => {
        this._dialogOpen = false;
        this._openAddOnLoad = false;
      }}
      ></schedule-view>
    `;
  }

  static getConfigElement() {
    return document.createElement('mealplan-card-editor');
  }

  static getStubConfig(): MealPlanCardConfig {
    return {
      title: 'MealPlan Card',
      portions: 6,
      overview_fields: [
        OverviewField.SCHEDULES,
        OverviewField.ACTIVE,
        OverviewField.TODAY,
        OverviewField.AVG_WEEK,
      ],
      transport_type: TransportType.SENSOR,
      show_schedules: false,
    } as MealPlanCardConfig;
  }

  static getGridOptions() {
    return {
      columns: 6,
      rows: 4,
      min_columns: 6,
      min_rows: 4,
    };
  }
}

declare global {
  interface Window {
    customCards?: Array<{
      type: string;
      name: string;
      description: string;
      preview?: boolean;
    }>;
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'mealplan-card',
  name: 'Mealplan Card',
  preview: false,
  description: 'Mealplan card to decode/encode base64 meal_plan',
});

log.info(`MealPlan Card ${getVersionString()}`);