import { DensityFunction, Identifier, NoiseGeneratorSettings, NoiseParameters, NoiseSettings, WorldgenRegistries } from "deepslate";
import { IContextMenuItem } from "litegraph.js";
import { AnonymousDatapack, Datapack, DatapackList, ResourceLocation } from "mc-datapack-loader";
import { GraphManager } from "./UI/GraphManager";

import { noise_router_fields } from "./vanilla/schemas";

import * as toastr from "toastr";

export class DatapackManager {
    static datapack: AnonymousDatapack
    static vanilla_datapack: Datapack
    static opened_datapack: Datapack | null = null
    static noise_settings: Map<string, NoiseGeneratorSettings> = new Map()

    static async init(version: string) {
        this.vanilla_datapack = await Datapack.fromZipUrl(`./data/vanilla_datapack_${version}.zip`, 12)
        
        const self = this;

        this.datapack = Datapack.compose(new class implements DatapackList{
            async getDatapacks(): Promise<AnonymousDatapack[]> {
                if (self.opened_datapack == null)
                    return [self.vanilla_datapack]
                else
                    return [self.vanilla_datapack, self.opened_datapack]
            }
        })
        await this.reload()
    }

    static async openDatapack(datapack: Datapack) {
        this.opened_datapack = datapack
        await this.reload()
    }

    static async reload() {
        WorldgenRegistries.DENSITY_FUNCTION.clear()
        for (const df of await this.datapack.getIds(ResourceLocation.WORLDGEN_DENSITY_FUNCTION)) {
            try{
                const json = await this.datapack.get(ResourceLocation.WORLDGEN_DENSITY_FUNCTION, df)
                WorldgenRegistries.DENSITY_FUNCTION.register(df, DensityFunction.fromJson(json))
            } catch (e) {
                toastr.error(e, `Could not load density function ${df}`)
            }
        }

        WorldgenRegistries.NOISE.clear()
        for (const n of await this.datapack.getIds(ResourceLocation.WORLDGEN_NOISE)) {
            try{
                const json = await this.datapack.get(ResourceLocation.WORLDGEN_NOISE, n)
                WorldgenRegistries.NOISE.register(n, NoiseParameters.fromJson(json))
            } catch (e) {
                toastr.error(e, `Could not load noise ${n}`)
            }
        }

        this.noise_settings.clear()
        for (const ns of await this.datapack.getIds(ResourceLocation.WORLDGEN_NOISE_SETTINGS)) {
            try{
                const json: any = await this.datapack.get(ResourceLocation.WORLDGEN_NOISE_SETTINGS, ns)
                this.noise_settings.set(ns.toString(), NoiseGeneratorSettings.fromJson(json))
            } catch (e) {
                toastr.error(e, `Could not load noise settings ${ns}`)
            }
        }
    }

    static async closeDatapacks() {
        this.opened_datapack = null
    }

    static getMenuOptions(): IContextMenuItem[] {
        return [{
            content: "Open",
            title: "Open",
            has_submenu: true,
            submenu: {
                options: [{
                    content: "density_function",
                    title: "Density Function",
                    has_submenu: true,
                    submenu: {
                        options: WorldgenRegistries.DENSITY_FUNCTION.keys().sort().map(df => {
                            return {
                                content: df.toString(),
                                title: df.toString(),
                                has_submenu: false,
                                callback: () => {
                                    var ns = this.tryGetNoiseSettingsFromDensityFunction(df.toString())
                                    if (Array.isArray(ns)) {
                                        ns = prompt("Which noise settings should be used?", ns[0]) ?? ns[0]
                                        if (!this.noise_settings.has(ns)) {
                                            toastr.warning(`using minecraft:overworld`, `Noise settings unknown`)
                                            ns = "minecraft:overworld"
                                        }
                                    } else {
                                        toastr.info(`using noise settings ${ns}`)
                                    }
                                    GraphManager.setNoiseSettings(Identifier.parse(ns))
                                    this.datapack.get(ResourceLocation.WORLDGEN_DENSITY_FUNCTION, df).then(json => GraphManager.loadJSON(json, df.toString()))
                                }
                            }
                        })
                    }
                }, {
                    content: "noise_settings",
                    title: "Noise Settings",
                    has_submenu: true,
                    submenu: {
                        options: Array.from(this.noise_settings.keys()).sort().map(ns => {
                            return {
                                content: ns,
                                title: ns,
                                has_submenu: true,
                                submenu: {
                                    options: noise_router_fields.map(field => {
                                        return {
                                            content: field,
                                            title: field,
                                            has_submenu: false,
                                            callback: () => {
                                                this.datapack.get(ResourceLocation.WORLDGEN_NOISE_SETTINGS, Identifier.parse(ns)).then((json: any) => {
                                                    GraphManager.setNoiseSettings(Identifier.parse(ns))
                                                    GraphManager.loadJSON(json.noise_router[field], ns + "/" + field)
                                                })
                                            }
                                        }
                                    })
                                }
                            }
                        })
                    }
                }]
            }
        }]
    }

    static tryGetNoiseSettingsFromDensityFunction(df_id: string): string | string[] {
        const [namespace, path] = df_id.split(":", 2)
        const folders = path.split("/")

        for (var i = folders.length - 1; i >= 1; i--) {
            const ns_name = `${namespace}:${folders.slice(0, i).join("/")}`
            if (this.noise_settings.has(ns_name)){
                return ns_name
            }
        }

        const ns_in_namespace = Array.from(this.noise_settings.keys()).filter(id => id.split(":", 2)[0] === namespace)
        if (ns_in_namespace.length === 1) {
            return ns_in_namespace[0]
        } else if (ns_in_namespace.length > 1) {
            return ns_in_namespace
        }

        const noise_setting_keys = Array.from(this.noise_settings.keys())
        for (var i = folders.length - 1; i >= 1; i--) {
            const ns_name = noise_setting_keys.find(ns_id => ns_id.match(`^[^\/:]+:${folders.slice(0, i).join("/")}$`))
            if (ns_name !== undefined){
                return ns_name
            }
        }

        return []
    }

    static async datapackSave(json: any, id: Identifier) {
        if (!this.datapack.canSave()) {
            return false
        } else {
           
            if (!(await this.datapack.save!(ResourceLocation.WORLDGEN_DENSITY_FUNCTION, id, json))) {
                return false
            }

            toastr.success(id.toString(), "Denisty function saved")

            return true
        }
    }
}