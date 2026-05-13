class CabinetRouter:
    _APP_DB = {'companies': 'default', 'users': 'user_profile'}

    def db_for_read(self, model, **hints):
        return self._APP_DB.get(model._meta.app_label)

    def db_for_write(self, model, **hints):
        return self._APP_DB.get(model._meta.app_label)

    def allow_relation(self, obj1, obj2, **hints):
        db1 = self._APP_DB.get(obj1._meta.app_label, 'default')
        db2 = self._APP_DB.get(obj2._meta.app_label, 'default')
        return db1 == db2

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        target = self._APP_DB.get(app_label)
        if target:
            return db == target
        return db == 'default'
