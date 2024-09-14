const BASE_URL = "https://scrapbox.io/api";

export class CosenseService {
  projectName: string;
  constructor(projectName: string) {
    if (projectName.length === 0) {
      throw new Error("invalid projectId");
    }
    this.projectName = projectName;
  }

  async search(q: string) {
    const query = new URLSearchParams({
      q,
    });
    const res = await fetch(
      `${BASE_URL}/pages/${this.projectName}/search/query?${query}`,
      {
        method: "GET",
      }
    );
    if (res.status === 200) {
      return await res.json();
    }
  }

  async getPageText(pageTitle: string) {
    const res = await fetch(
      `${BASE_URL}/pages/${this.projectName}/${pageTitle}/text`,
      { method: "GET" }
    );
    if (res.status === 200) {
      return await res.text()
    }
  }
}
