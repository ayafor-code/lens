/**
 * Copyright (c) 2021 OpenLens Authors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { reaction } from "mobx";
import { StorageAdapter, StorageHelper } from "../storageHelper";
import { delay } from "../../../common/utils/delay";

describe("renderer/utils/StorageHelper", () => {
  describe("window.localStorage might be used as StorageAdapter", () => {
    type StorageModel = string;

    const storageKey = "ui-settings";
    let storageHelper: StorageHelper<StorageModel>;

    beforeEach(() => {
      localStorage.clear();

      storageHelper = new StorageHelper<StorageModel>(storageKey, {
        autoInit: false,
        storage: localStorage,
        defaultValue: "test",
      });
    });

    it("initialized with default value", async () => {
      localStorage.setItem(storageKey, "saved"); // pretending it was saved previously

      expect(storageHelper.key).toBe(storageKey);
      expect(storageHelper.defaultValue).toBe("test");
      expect(storageHelper.get()).toBe("test");

      storageHelper.init();

      expect(storageHelper.key).toBe(storageKey);
      expect(storageHelper.defaultValue).toBe("test");
      expect(storageHelper.get()).toBe("saved");
    });

    it("updates storage", async () => {
      storageHelper.init();

      storageHelper.set("test2");
      expect(localStorage.getItem(storageKey)).toBe("test2");

      localStorage.setItem(storageKey, "test3");
      storageHelper.init({ force: true }); // reload from underlying storage and merge
      expect(storageHelper.get()).toBe("test3");
    });
  });

  describe("Using custom StorageAdapter", () => {
    const storageKey = "mySettings";
    const storageMock: Record<string, any> = {
      [storageKey]: undefined,
    };
    const defaultValue = {
      message: "hello-world",
      deepDataTree: {
        other: "stuff",
        some: "thing",
      }
    };

    type StorageModel = Partial<typeof defaultValue>;
    let storageHelper: StorageHelper<StorageModel>;
    let storageHelperAsync: StorageHelper<StorageModel>;
    let storageAdapter: StorageAdapter<StorageModel>;

    beforeEach(() => {
      storageAdapter = {
        getItem: jest.fn((key: string) => {
          return {
            ...defaultValue,
            message: "saved-before",
          };
        }),
        setItem: jest.fn((key: string, value: any) => {
          storageMock[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete storageMock[key];
        }),
      };

      storageHelper = new StorageHelper(storageKey, {
        autoInit: false,
        defaultValue,
        storage: storageAdapter,
      });

      storageHelperAsync = new StorageHelper(storageKey, {
        autoInit: false,
        defaultValue,
        storage: {
          ...storageAdapter,
          async getItem(key: string): Promise<StorageModel> {
            await delay(500); // fake loading timeout

            return storageAdapter.getItem(key);
          }
        },
      });
    });

    it("loads data from storage with fallback to default-value", () => {
      expect(storageHelper.get()).toEqual(defaultValue);
      storageHelper.init();

      expect(storageHelper.get().message).toBe("saved-before");
      expect(storageAdapter.getItem).toHaveBeenCalledWith(storageHelper.key);
    });

    it("async loading from storage supported too", async () => {
      expect(storageHelperAsync.initialized).toBeFalsy();
      storageHelperAsync.init();
      await delay(300);
      expect(storageHelperAsync.get()).toEqual(defaultValue);
      await delay(200);
      expect(storageHelperAsync.get().message).toBe("saved-before");
    });

    it("set() fully replaces data in storage", () => {
      storageHelper.init();
      storageHelper.set({ message: "test2" });
      expect(storageHelper.get().message).toBe("test2");
      expect(storageMock[storageKey]).toEqual({ message: "test2" });
      expect(storageAdapter.setItem).toHaveBeenCalledWith(storageHelper.key, { message: "test2" });
    });

    it("merge() does partial data tree updates", async () => {
      expect(storageHelper.get()).toEqual(defaultValue);

      storageHelper.init();
      storageHelper.merge({ message: "updated" });
      expect(storageHelper.get()).toEqual({ ...defaultValue, message: "updated" });

      // deep store updates
      storageHelper.merge(draft => {
        draft.deepDataTree.some = "blabla";
      });
      expect(storageHelper.get()).toEqual({
        message: "updated",
        deepDataTree: {
          ...defaultValue.deepDataTree,
          some: "blabla",
        }
      });

      // allows to get access to current state before merge
      storageHelper.merge(({ message }) => ({
        message: Array(2).fill(message).join("-"),
      }));
      expect(storageHelper.get().message).toEqual("updated-updated");
    });
  });

  describe("data in storage-helper is observable (mobx)", () => {
    let storageHelper: StorageHelper<any>;
    const defaultValue: any = { firstName: "Joe" };
    const observedChanges: any[] = [];

    beforeEach(() => {
      observedChanges.length = 0;

      storageHelper = new StorageHelper<typeof defaultValue>("some-key", {
        autoInit: true,
        defaultValue,
        storage: {
          getItem: jest.fn(),
          setItem: jest.fn(),
          removeItem: jest.fn(),
        },
      });
    });

    it("storage.get() is observable", () => {
      expect(storageHelper.get()).toEqual(defaultValue);

      reaction(() => storageHelper.toJS(), change => {
        observedChanges.push(change);
      });

      storageHelper.merge({ lastName: "Black" });
      storageHelper.set("whatever");
      storageHelper.set({ other: "some-data" });

      expect(observedChanges[0]).toEqual({ ...defaultValue, lastName: "Black" });
      expect(observedChanges[1]).toEqual("whatever");
      expect(observedChanges[2].other).toBe("some-data");
    });
  });

});
