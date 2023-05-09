import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { inject as service } from "@ember/service";
import { ajax } from "discourse/lib/ajax";
import { defaultHomepage } from "discourse/lib/utilities";
import loadScript from "discourse/lib/load-script";

export default class OnboardingTips extends Component {
  @service router;
  @service site;
  @service store;
  @service siteSettings;
  @service currentUser;
  @tracked hasEmptyUserFields = false;
  @tracked fullProfile = null;
  @tracked loading = true;
  @tracked incompleteUserFields = [];
  @tracked currentRandomIndex = -1;
  @tracked shouldShow = true;
  @tracked dismissalExpirationTime = null;
  @tracked isDismissed;
  @tracked showCompletion = false;
  @tracked confetti;

  constructor() {
    super(...arguments);

    this.boundHandleRouteChange = this.handleRouteChange.bind(this);
    this.router.on("routeDidChange", this.boundHandleRouteChange);

    if (this.currentUser) {
      this.checkDismissalStatus();
    }
  }

  willDestroy() {
    this.router.off("routeDidChange", this.boundHandleRouteChange);
  }

  #getFilteredItems() {
    return this.listItems.filter(
      (item) => item.condition === undefined || item.condition
    );
  }

  #parsePriority(setting) {
    if (setting === "high") {
      return 2;
    }
    if (setting === "low") {
      return 1;
    }
    if (setting === "disabled") {
      return 0;
    }
  }

  get shouldShowOnboarding() {
    return (
      this.currentUser &&
      this.showOn &&
      !this.tooSoon &&
      this.isNoob &&
      this.shouldShow &&
      !this.isDismissed
    );
  }

  async handleRouteChange() {
    const isPreferences = this.router.currentRoute.name.includes("preferences");

    if (
      isPreferences &&
      this.router.currentRoute.attributes?.username ===
        this.currentUser.username
    ) {
      // don't show tips when someone's on their preferences page
      this.shouldShow = false;
      // there's a good chance someone changed some things, so ditch the cached profile
      const localStorageKey = `fullProfile_${this.currentUser.username}`;
      localStorage.removeItem(localStorageKey);
    } else {
      this.shouldShow = true;
      // change tip on route change
      this.setRandomListItem();
    }
  }

  get tooSoon() {
    // if the user was created less than 24 hours ago (by default), don't show the tips...
    // give them a little chance to acclimate and complete other new user tasks
    if (!this.currentUser) {
      return true;
    }

    if (this.fullProfile?.created_at) {
      const createdAt = new Date(this.fullProfile.created_at);
      const now = new Date();
      const timeSinceCreation = now.getTime() - createdAt.getTime();
      const oneDay = settings.hours_before_showing * 60 * 60 * 1000; // hours to milliseconds
      return timeSinceCreation < oneDay;
    }
  }

  get showOn() {
    if (settings.show_on === "homepage") {
      return this.router.currentRouteName === `discovery.${defaultHomepage()}`;
    } else {
      return true;
    }
  }

  get canJoinChat() {
    return (
      this.site.siteSettings.chat_enabled &&
      this.currentUser.can_chat &&
      this.currentUser.has_joinable_public_channels
    );
  }

  get isNoob() {
    return (
      !this.currentUser.user_option.skip_new_user_tips &&
      this.currentUser.trust_level <= settings.max_trust_level
    );
  }

  get hasValidItems() {
    return this.listItems.some(
      (item) => item.condition === undefined || item.condition
    );
  }

  get listItems() {
    return [
      {
        weight: this.#parsePriority(settings.faq_priority),
        id: "onboarding-read-faq",
        label: "Has not read FAQ",
        condition: !this.currentUser.read_faq,
      },
      {
        weight: this.#parsePriority(settings.twofactor_priority),
        id: "onboarding-second-factor",
        label: "Does not have second factor",
        condition: !this.currentUser.second_factor_enabled,
      },
      {
        weight: this.#parsePriority(settings.chat_priority),
        id: "onboarding-no-channels",
        label: "No chat channels joined",
        condition:
          this.canJoinChat &&
          this.currentUser.chat_channels.public_channels.length === 0,
      },
      {
        weight: this.#parsePriority(settings.avatar_priority),
        id: "onboarding-has-letter-avatar",
        label: "Still has letter avatar",
        condition: this.currentUser.avatar_template.includes("/letter/"),
      },
      {
        weight: this.#parsePriority(settings.name_priority),
        id: "onboarding-no-name",
        label: "Has not added a name",
        condition:
          !this.siteSettings.prioritize_username_in_ux &&
          this.fullProfile?.can_edit_name &&
          !this.currentUser.name,
      },
      {
        weight: this.#parsePriority(settings.bio_priority),
        id: "onboarding-no-bio",
        label: "Does not have bio",
        condition:
          this.fullProfile?.can_change_bio && !this.fullProfile.bio_raw,
      },
    ];
  }

  get randomListItem() {
    const items = this.#getFilteredItems();
    return items[this.currentRandomIndex];
  }

  async fetchAndStoreProfileData() {
    this.loading = true;

    // caching the full profile here
    const localStorageKey = `fullProfile_${this.currentUser.username}`;

    try {
      const json = await ajax(`/u/${this.currentUser.username}.json`, {});

      const userDataWithTimestamp = {
        userData: json.user,
        timestamp: new Date().getTime(),
      };

      // store the fetched profile and timestamp in localStorage
      localStorage.setItem(
        localStorageKey,
        JSON.stringify(userDataWithTimestamp)
      );

      this.fullProfile = json.user;
      this.loading = false;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching full profile:", error);
      this.loading = false;
    }
  }

  @action
  async setRandomListItem() {
    await this.fetchAndStoreProfileData();

    const items = this.#getFilteredItems();

    if (items.length === 0) {
      this.currentRandomIndex = -1;
      this.shouldShow = false;
    } else {
      const cumulativeWeights = [];
      let totalWeight = 0;

      for (const item of items) {
        totalWeight += item.weight;
        cumulativeWeights.push(totalWeight);
      }

      const randomNumber = Math.random() * totalWeight;

      for (let i = 0; i < cumulativeWeights.length; i++) {
        if (randomNumber <= cumulativeWeights[i]) {
          this.currentRandomIndex = i;
          break;
        }
      }
    }
  }

  @action
  async getFullProfile() {
    const localStorageKey = `fullProfile_${this.currentUser.username}`;
    const storedProfile = localStorage.getItem(localStorageKey);

    // only check the full profile for changes every 12 hours
    const expiryDuration = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

    if (storedProfile) {
      const { userData, timestamp } = JSON.parse(storedProfile);
      const currentTime = new Date().getTime();

      if (currentTime - timestamp < expiryDuration) {
        this.fullProfile = userData;
        this.loading = false;
      } else {
        await this.fetchAndStoreProfileData();
      }
    } else {
      await this.fetchAndStoreProfileData();
    }

    if (!this.hasValidItems) {
      this.shouldShow = false;
    }
  }

  @action
  showDifferentListItem() {
    const items = this.#getFilteredItems();

    let newRandomIndex;
    do {
      newRandomIndex = Math.floor(Math.random() * items.length);
    } while (newRandomIndex === this.currentRandomIndex);

    this.currentRandomIndex = newRandomIndex;
  }

  @action
  checkDismissalStatus() {
    const localStorageKey = `onboardingDismissalStatus_${this.currentUser.username}`;
    const dismissalStatus = localStorage.getItem(localStorageKey);

    if (dismissalStatus) {
      const { isDismissed, expirationTime } = JSON.parse(dismissalStatus);
      const currentTime = new Date().getTime();

      if (isDismissed && currentTime < expirationTime) {
        this.dismissalExpirationTime = expirationTime;
        this.isDismissed = true;
      } else {
        this.clearDismissalStatus();
      }
    }
  }

  @action
  clearDismissalStatus() {
    const localStorageKey = `onboardingDismissalStatus_${this.currentUser.username}`;
    localStorage.removeItem(localStorageKey);
    this.dismissalExpirationTime = null;
    this.isDismissed = false;
  }

  @action
  dismissBanner() {
    // dismissal is temporary
    const localStorageKey = `onboardingDismissalStatus_${this.currentUser.username}`;
    const expirationTime =
      new Date().getTime() + settings.dismiss_duration * 60 * 60 * 1000; // 24 hours in milliseconds
    const dismissalStatus = {
      isDismissed: true,
      expirationTime,
    };

    localStorage.setItem(localStorageKey, JSON.stringify(dismissalStatus));
    this.dismissalExpirationTime = expirationTime;
    this.isDismissed = true;
    this.shouldShow = false;
  }

  @action
  async disableOnboarding() {
    // disabling is tied to the "skip new user tips" setting
    try {
      await ajax(`/u/${this.currentUser.username}.json`, {
        type: "PUT",
        data: {
          skip_new_user_tips: true,
        },
      });

      this.shouldShow = false;

      // clear the cached profile
      const localStorageKey = `fullProfile_${this.currentUser.username}`;
      localStorage.removeItem(localStorageKey);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error disabling onboarding:", error);
    }
  }

  @action
  async checkCompletion() {
    await this.getFullProfile();

    if (!this.hasValidItems) {
      this.showCompletion = true;
    } else {
      this.setRandomListItem();
    }
  }

  @action
  celebrate() {
    loadScript(settings.theme_uploads.confetti).then(() => {
      const canvas = document.createElement("canvas");
      canvas.id = "confetti-canvas";
      document.body.appendChild(canvas);

      const confettiElement = document.getElementById(canvas.id);
      const confettiSettings = { target: confettiElement };
      this.confetti = new ConfettiGenerator(confettiSettings);
      this.confetti.render();
    });
  }

  @action
  partyOver() {
    this.showCompletion = false;

    if (this.confetti) {
      this.confetti.clear();
      this.confetti = null;

      const canvas = document.getElementById("confetti-canvas");
      if (canvas) {
        canvas.remove();
      }
    }
  }
}
