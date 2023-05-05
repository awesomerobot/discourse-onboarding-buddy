import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { inject as service } from "@ember/service";
import { ajax } from "discourse/lib/ajax";
import { defaultHomepage } from "discourse/lib/utilities";

export default class OnboardingChecklist extends Component {
  @service router;
  @service site;
  @service store;
  @service siteSettings;
  @service currentUser;
  @tracked hasEmptyUserFields = false;
  @tracked fullProfile = null;
  @tracked loading = true;
  @tracked incompleteUserFields = [];
  @tracked shouldShow = true;

  constructor() {
    super(...arguments);

    this.router.on("routeDidChange", this.handleRouteChange.bind(this));
  }

  willDestroy() {
    this.router.off("routeDidChange", this.handleRouteChange.bind(this));
  }

  async handleRouteChange() {
    const isPreferences = this.router.currentRoute.name.includes("preferences");

    if (
      isPreferences &&
      this.router.currentRoute.attributes?.username ===
        this.currentUser.username
    ) {
      const localStorageKey = `fullProfile_${this.currentUser.username}`;
      localStorage.setItem(localStorageKey, JSON.stringify(this.currentUser));
    }
  }

  get isHomepage() {
    this.loading = true;
    return this.router.currentRouteName === `discovery.${defaultHomepage()}`;
  }

  get hasLetterAvatar() {
    return this.currentUser.avatar_template.includes("/letter/");
  }

  get hasJoinedChat() {
    return (
      this.site.siteSettings.chat_enabled &&
      this.currentUser.can_chat &&
      this.currentUser.has_joinable_public_channels &&
      this.currentUser.chat_channels.public_channels.length > 0
    );
  }

  get hasCustomizedSidebar() {
    return (
      this.currentUser.sidebar_category_ids.length > 0 ||
      this.currentUser.sidebar_tags.length > 0 ||
      (this.currentUser.custom_sidebar_sections_enabled &&
        this.currentUser.sidebar_sections.length > 0)
    );
  }

  get isNoob() {
    return (
      !this.currentUser.user_option.skip_new_user_tips ||
      !this.currentUser.trust_level >= 4
    );
  }

  get listItems() {
    return [
      {
        weight: 1,
        id: "onboarding-read-faq",
        label: "Has not read FAQ",
        condition: !this.currentUser.read_faq,
      },
      {
        weight: 1,
        id: "onboarding-second-factor",
        label: "Does not have second factor",
        condition: !this.currentUser.second_factor_enabled,
      },
      {
        weight: 2,
        id: "onboarding-no-channels",
        label: "No chat channels joined",
        condition: !this.hasJoinedChat,
      },
      {
        weight: 1,
        id: "onboarding-has-letter-avatar",
        label: "Still has letter avatar",
        condition: this.hasLetterAvatar,
      },
      {
        weight: 1,
        id: "onboarding-custom-sidebar",
        label: "Has no sidebar items",
        condition: !this.hasCustomizedSidebar,
      },
      {
        weight: 1,
        id: "onboarding-no-posts",
        label: "Does not have any posts",
        condition: !this.currentUser.any_posts,
      },
      {
        weight: 1,
        id: "onboarding-no-name",
        label: "Has not added a name",
        condition:
          !this.siteSettings.prioritize_username_in_ux &&
          this.fullProfile?.can_edit_name &&
          !this.currentUser.name,
      },
      {
        weight: 1,
        id: "onboarding-no-bio",
        label: "Does not have bio",
        condition:
          this.fullProfile?.can_change_bio && !this.fullProfile.bio_raw,
      },
    ];
  }

  get randomListItem() {
    const items = this.listItems.filter(
      (item) => item.condition === undefined || item.condition
    );
    const cumulativeWeights = [];
    let totalWeight = 0;

    for (const item of items) {
      totalWeight += item.weight;
      cumulativeWeights.push(totalWeight);
    }

    const randomNumber = Math.random() * totalWeight;

    for (let i = 0; i < cumulativeWeights.length; i++) {
      if (randomNumber <= cumulativeWeights[i]) {
        return items[i];
      }
    }
  }

  async fetchAndStoreProfileData() {
    const localStorageKey = `fullProfile_${this.currentUser.username}`;

    try {
      const json = await ajax(`/u/${this.currentUser.username}.json`, {});
      const userDataWithTimestamp = {
        userData: json.user,
        timestamp: new Date().getTime(),
      };

      // Store the fetched profile and timestamp in localStorage
      localStorage.setItem(
        localStorageKey,
        JSON.stringify(userDataWithTimestamp)
      );
      this.fullProfile = json.user;
      this.loading = false;
    } catch (error) {
      console.error("Error fetching full profile:", error);
      this.loading = false;
    }
  }

  @action
  async getFullProfile() {
    const localStorageKey = `fullProfile_${this.currentUser.username}`;
    const storedProfile = localStorage.getItem(localStorageKey);
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
  }

  @action
  async disableOnboarding() {
    try {
      const response = await ajax(`/u/${this.currentUser.username}.json`, {
        type: "PUT",
        data: {
          skip_new_user_tips: true,
        },
      });

      this.fullProfile = response.user;
      this.shouldShow = false;

      const localStorageKey = `fullProfile_${this.currentUser.username}`;
      const userDataWithTimestamp = {
        userData: response.user,
        timestamp: new Date().getTime(),
      };
      localStorage.setItem(
        localStorageKey,
        JSON.stringify(userDataWithTimestamp)
      );
    } catch (error) {
      console.error("Error disabling onboarding:", error);
    }
  }
}
