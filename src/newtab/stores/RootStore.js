import LinkStore from "./LinkStores";
import OptionStores from "./OptionStores";
import ToolsStores from "./ToolStores";
import HomeStores from "./HomeStores";
import DataStores from "./DataStores";

export default class RootStore {
  link;
  option;
  tools;
  home;
  data;

  constructor() {
    this.option = new OptionStores(this);
    this.link = new LinkStore(this);
    this.tools = new ToolsStores(this);
    this.home = new HomeStores(this);
    this.data = new DataStores(this);
  }
}
