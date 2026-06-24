import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { localize } from '../locales/localize';
import type { FeedingTime, EditMealState, HomeAssistant } from '../types';
import { ProfileField } from '../types';
import { MealStateController } from '../mealStateController';
import { hasProfileField, timeToMinutes, areMealsEqual } from '../utils';
import { ScheduleClosedEvent } from '../constants';
import './edit-dialog';
import type { MealEditDialog } from './edit-dialog';
import './meal-card';
import './message-banner';

@customElement('schedule-view')
export class ScheduleView extends LitElement {
  @property({ type: Object }) mealState!: MealStateController;
  @property({ type: Object }) hass!: HomeAssistant;
  @property({ type: Boolean }) openAddOnLoad = false;

  @state() private draftMeals: FeedingTime[] = [];
  @state() private editMeal: EditMealState | null = null;
  @state() private heading: string = localize('schedule_view.manage_schedules');
  @state() private dataAvailable = true;

  private unsubscribe?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.draftMeals = this.sortMealsByTime([...this.mealState.meals]);

    this.mealState.isDataAvailable().then((available) => {
      this.dataAvailable = available;
    });

    this.unsubscribe = this.mealState.subscribe(() => {
      this.syncMealsWithController();
    });

    if (this.openAddOnLoad) {
      this.handleOpenAdd();
    }
  }

  private sortMealsByTime(meals: FeedingTime[]): FeedingTime[] {
    return [...meals].sort(
      (a, b) =>
        timeToMinutes(a.hour, a.minute) - timeToMinutes(b.hour, b.minute),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  static styles = css`
    .schedule-cards {
      display: block;
      overflow-y: auto;
      padding: 8px 0;
    }
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--secondary-text-color);
    }
    .empty-state ha-icon {
      --mdc-icon-size: 48px;
      color: var(--disabled-text-color);
      margin-bottom: 16px;
    }
    .empty-state-title {
      font-size: 1.1em;
      font-weight: 500;
      margin-bottom: 8px;
    }
    .empty-state-subtitle {
      font-size: 0.9em;
    }
  `;

  private syncMealsWithController(): void {
    this.draftMeals = this.sortMealsByTime([...this.mealState.meals]);
  }

  private updateMeal(index: number, meal: FeedingTime): void {
    this.draftMeals = this.sortMealsByTime(
      this.draftMeals.map((m, i) => (i === index ? meal : m)),
    );
  }

  public getMeals(): FeedingTime[] {
    return this.draftMeals;
  }

  public getEditMeals(): EditMealState | null {
    return this.editMeal;
  }

  public handleMealAction(
    action: 'update' | 'delete' | 'edit',
    index: number,
    meal: FeedingTime,
  ): void {
    if (action === 'update') {
      this.draftMeals = this.draftMeals.map((m, i) => (i === index ? meal : m));
    } else if (action === 'delete') {
      this.draftMeals = this.draftMeals.filter((_, i) => i !== index);
    } else if (action === 'edit') {
      this.heading = localize('schedule_view.edit_feeding_time');
      this.editMeal = { meal, index };
    }
  }

  public addMeal(meal: FeedingTime): void {
    this.draftMeals = this.sortMealsByTime([...this.draftMeals, meal]);
  }

  public handleOpenAdd() {
    this.heading = localize('common.add_meal');
    this.editMeal = {
      meal: { hour: 12, minute: 0, portion: 1, days: 127, enabled: 1 },
    } satisfies EditMealState;
  }

  public async handleCancel() {
    this.syncMealsWithController();
    this.dispatchEvent(new ScheduleClosedEvent());
  }

  public async handleSave() {
    await this.mealState.saveMeals(this.draftMeals);
    this.dispatchEvent(new ScheduleClosedEvent());
  }

  private handleDialogClosed() {
    this.dispatchEvent(new ScheduleClosedEvent());
  }

  public handleEditSave(e: CustomEvent<EditMealState>) {
    const { meal, index } = e.detail;

    if (index !== undefined && index >= 0) {
      this.updateMeal(index, meal);
    } else {
      this.addMeal(meal);
    }

    this.closeEditForm();
  }

  private closeEditForm() {
    this.heading = localize('schedule_view.manage_schedules');
    this.editMeal = null;
  }

  private hasPendingChanges(): boolean {
    return !areMealsEqual(this.draftMeals, this.mealState.meals);
  }

  private renderMealForm() {
    if (this.editMeal === null) return '';

    return html`
      <div>
        <meal-edit-dialog
          .meal=${this.editMeal.meal}
          .index=${this.editMeal.index}
          .profile=${this.mealState.profile}
          .open=${true}
          @save=${this.handleEditSave}
          @cancel=${this.closeEditForm}
        ></meal-edit-dialog>
      </div>
      <ha-dialog-footer slot="footer">
        <ha-button
          slot="secondaryAction"
          appearance="plain"
          @click=${this.closeEditForm}
        >
          ${localize('common.back')}
        </ha-button>
        <ha-button
          slot="primaryAction"
          @click=${() => {
            const dialog =
              this.shadowRoot?.querySelector<MealEditDialog>(
                'meal-edit-dialog',
              );
            dialog?.handleSave();
          }}
        >
          ${localize('common.save')}
        </ha-button>
      </ha-dialog-footer>
    `;
  }

  private renderEmptyState() {
    return html`
      <div class="empty-state">
        <ha-icon icon="mdi:calendar-blank"></ha-icon>
        <div class="empty-state-title">
          ${localize('schedule_view.no_meals_scheduled')}
        </div>
        <div class="empty-state-subtitle">
          ${localize('schedule_view.click_add_meal_to_get_started')}
        </div>
      </div>
    `;
  }

  private renderAddButton() {
    if (!hasProfileField(this.mealState.profile, ProfileField.ADD)) return '';

    return html`
      <ha-button
        slot="secondaryAction"
        appearance="plain"
        @click=${this.handleOpenAdd}
      >
        ${localize('common.add_meal')}
      </ha-button>
    `;
  }

  private renderCardView() {
    if (this.editMeal !== null) return '';
    if (!this.mealState.profile) return '';

    return html`
      <message-banner
        .type=${'warning'}
        .title=${localize('schedule_view.sensor_unavailable')}
        .message=${localize('schedule_view.sensor_unavailable_message')}
        ?hidden=${this.dataAvailable}
      ></message-banner>
      <div class="schedule-cards">
        ${this.draftMeals.length === 0
          ? this.renderEmptyState()
          : this.draftMeals.map(
              (meal, index) => html`
                <meal-card
                  .meal=${meal}
                  .index=${index}
                  .profile=${this.mealState.profile}
                  .onMealAction=${this.handleMealAction.bind(this)}
                >
                </meal-card>
              `,
            )}
      </div>
      <ha-dialog-footer slot="footer">
        ${this.renderAddButton()}
        <ha-button
          slot="secondaryAction"
          appearance="plain"
          @click=${this.handleCancel}
        >
          ${localize('common.cancel')}
        </ha-button>
        <ha-button
          slot="primaryAction"
          @click=${this.handleSave}
          ?disabled=${!this.hasPendingChanges() || !this.dataAvailable}
        >
          ${localize('common.save')}
        </ha-button>
      </ha-dialog-footer>
    `;
  }

  render() {
    return html`
      <ha-dialog
        open
        header-title=${this.heading}
        @closed=${this.handleDialogClosed}
      >
        <meal-message-display></meal-message-display>
        ${this.renderCardView()} ${this.renderMealForm()}
      </ha-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'schedule-view': ScheduleView;
  }
}
