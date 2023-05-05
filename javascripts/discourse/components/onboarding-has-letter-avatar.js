import Component from "@glimmer/component";
import EmberObject, { action, computed, set } from "@ember/object";
import { tracked } from "@glimmer/tracking";
import { ajax } from "discourse/lib/ajax";
import { inject as service } from "@ember/service";
import { isEmpty } from "@ember/utils";
import { dasherize } from "@ember/string";
import showModal from "discourse/lib/show-modal";

export default class OnboardingUnfilledUserFields extends Component {
  @service currentUser;

  @action
  showAvatarSelector(user) {
    showModal("avatar-selector").setProperties({
      user,
      "user.email": this.args.fullProfile.email,
    });
  }
}
